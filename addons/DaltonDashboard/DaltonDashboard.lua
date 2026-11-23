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
          ns.RecordError("RegisterEvent:" .. tostring(event), err)
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
    for _, module in ipairs(ns.modules) do ns.Run(module, "Initialize") end
    registerModuleEvents()
    self:UnregisterEvent("ADDON_LOADED")
    ns.Chat("Datenerfassung geladen. /dalton zeigt den Status.")
    return
  end
  dispatch(event, ...)
end)

local function captureAll()
  for _, module in ipairs(ns.modules) do
    ns.Run(module, "Capture", "manual")
  end
  ns.Chat("Lokaler Datensatz wurde aktualisiert.")
end

local function status()
  local db = ns.GetDB()
  local parts = {}
  for _, key in ipairs({"character", "spellbook", "location", "instances", "inventory", "hunter", "economy"}) do
    local value = db[key]
    if type(value) == "table" then
      parts[#parts + 1] = key .. ":" .. tostring(value.capturedAt or "ja")
    end
  end
  ns.Chat("Version " .. tostring(ns.VERSION) .. " · Schema " .. tostring(db.schemaVersion))
  ns.Chat(#parts > 0 and table.concat(parts, " · ") or "Noch keine Daten erfasst.")
  ns.Chat("Daten bleiben derzeit ausschließlich lokal in SavedVariables.")
end

SLASH_DALTONDASHBOARD1 = "/dalton"
SLASH_DALTONDASHBOARD2 = "/daltonsync"
SlashCmdList.DALTONDASHBOARD = function(command)
  command = tostring(command or ""):lower():match("^%s*(.-)%s*$")
  if command == "scan" then
    captureAll()
  elseif command == "errors" then
    local errors = ns.GetDB().diagnostics.errors or {}
    if #errors == 0 then
      ns.Chat("Keine protokollierten Fehler.")
    else
      ns.Chat("Letzte Fehler:")
      for index = 1, math.min(5, #errors) do
        local errorEntry = errors[index]
        ns.Chat(tostring(errorEntry.where) .. ": " .. tostring(errorEntry.message))
      end
    end
  else
    status()
  end
end
