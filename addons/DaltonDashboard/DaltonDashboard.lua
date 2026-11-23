local ADDON_NAME, ns = ...

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")

local function registerModuleEvents()
  local registered = {}
  for _, module in ipairs(ns.modules) do
    for event in pairs(module.events or {}) do
      if not registered[event] then
        local ok, err = pcall(frame.RegisterEvent, frame, event)
        if ok then
          registered[event] = true
        else
          ns.RecordCompatibility("RegisterEvent:" .. tostring(event), err)
        end
      end
    end
  end
end

local function dispatch(event, ...)
  for _, module in ipairs(ns.modules) do
    if module.events and module.events[event] then
      ns.Run(module, "OnEvent", event, ...)
    end
  end
end

frame:SetScript("OnEvent", function(self, event, ...)
  if event == "ADDON_LOADED" then
    local loaded = ...
    if loaded ~= ADDON_NAME then return end

    ns.EnsureDB()
    for _, module in ipairs(ns.modules) do
      ns.Run(module, "Initialize")
    end
    registerModuleEvents()
    self:UnregisterEvent("ADDON_LOADED")
    ns.Chat("Datenerfassung geladen. /dalton zeigt den Status.")
    return
  end

  dispatch(event, ...)
end)

local function captureAll()
  local succeeded, failed = 0, {}
  for _, module in ipairs(ns.modules) do
    local ok = ns.Run(module, "Capture", "manual")
    if ok then
      succeeded = succeeded + 1
    else
      failed[#failed + 1] = module.name or "?"
    end
  end

  if #failed == 0 then
    ns.Chat("Lokaler Datensatz wurde aktualisiert (" .. tostring(succeeded) .. " Module).")
  else
    ns.Chat("Datensatz teilweise aktualisiert. Fehler in: " .. table.concat(failed, ", ") .. ".")
  end
end

local function status()
  local db = ns.GetDB()
  local parts = {}
  for _, key in ipairs({"character", "spellbook", "location", "locationHistory", "interactions", "instances", "inventory", "hunter", "economy"}) do
    local value = db[key]
    if type(value) == "table" then
      parts[#parts + 1] = key .. ":" .. tostring(value.capturedAt or "ja")
    end
  end

  ns.Chat("Version " .. tostring(ns.VERSION) .. " · Schema " .. tostring(db.schemaVersion))
  ns.Chat(#parts > 0 and table.concat(parts, " · ") or "Noch keine Daten erfasst.")
  ns.Chat("Das Addon selbst sendet nichts ins Internet. Ein optionaler lokaler Companion kann freigegebene Bereiche nach dem Speichern der SavedVariables synchronisieren.")
end

local function printDiagnostics(kind)
  local db = ns.GetDB()
  local list = db.diagnostics[kind] or {}
  if #list == 0 then
    ns.Chat(kind == "errors" and "Keine protokollierten Fehler." or "Keine Kompatibilitätshinweise.")
    return
  end

  ns.Chat(kind == "errors" and "Letzte Fehler:" or "Letzte Kompatibilitätshinweise:")
  for index = 1, math.min(8, #list) do
    local entry = list[index]
    ns.Chat(tostring(entry.where) .. ": " .. tostring(entry.message))
  end
end

SLASH_DALTONDASHBOARD1 = "/dalton"
SLASH_DALTONDASHBOARD2 = "/daltonsync"
SlashCmdList.DALTONDASHBOARD = function(command)
  command = tostring(command or ""):lower():match("^%s*(.-)%s*$")

  if command == "scan" then
    captureAll()
  elseif command == "errors" then
    printDiagnostics("errors")
  elseif command == "compat" then
    printDiagnostics("compatibility")
  else
    status()
  end
end
