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
  ns.Chat("Das Addon sendet keine Daten ins Internet. Dalton-Gruppenmitglieder können freigegebene Daten ingame an Cole weiterreichen; nur Coles lokaler Sync überträgt sie später zum Dashboard.")
end

local function printPerformance()
  local db = ns.GetDB()
  local rows = {}
  for name, entry in pairs(db.diagnostics.modules or {}) do
    if type(entry) == "table" and tonumber(entry.runs) then
      rows[#rows + 1] = {
        name = tostring(name),
        runs = tonumber(entry.runs) or 0,
        last = tonumber(entry.lastDurationMs),
        max = tonumber(entry.maxDurationMs),
        avg = tonumber(entry.averageDurationMs)
      }
    end
  end
  table.sort(rows, function(a, b) return a.name < b.name end)
  if #rows == 0 then
    ns.Chat("Noch keine Performance-Messwerte vorhanden.")
    return
  end
  ns.Chat("Performance seit diesem Login (nur ereignisgesteuerte Aufrufe):")
  for _, row in ipairs(rows) do
    ns.Chat(row.name .. " · " .. tostring(row.runs) .. " Aufrufe · zuletzt " ..
      (row.last and string.format("%.2f ms", row.last) or "–") .. " · Ø " ..
      (row.avg and string.format("%.2f ms", row.avg) or "–") .. " · max " ..
      (row.max and string.format("%.2f ms", row.max) or "–"))
  end
end

local function printRelayStatus()
  if type(ns.RelayStatus) ~= "function" then
    ns.Chat("Peer-Relay ist auf diesem Client nicht verfügbar.")
    return
  end
  local relay = ns.RelayStatus()
  ns.Chat("Relay-Rolle: " .. tostring(relay.role) .. " · Cole in Gruppe: " .. (relay.targetVisible and "ja" or "nein"))
  ns.Chat("Ausstehend: " .. (relay.pending and "ja" or "nein") ..
    " · letzter Versuch: " .. tostring(relay.lastAttemptAt or "–") ..
    " · letzte Bestätigung: " .. tostring(relay.lastAckAt or "–"))
  if relay.role == "Hub" then
    ns.Chat("Empfangene Gruppenmitglieder im Relay-Postfach: " .. tostring(relay.inboxCount or 0))
  end
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
  elseif command == "perf" then
    printPerformance()
  elseif command == "relay" then
    printRelayStatus()
  else
    status()
  end
end
