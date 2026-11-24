local ADDON_NAME, ns = ...

ns.ADDON_NAME = ADDON_NAME
ns.SCHEMA_VERSION = 1
ns.modules = ns.modules or {}

local function addonVersion()
  if C_AddOns and C_AddOns.GetAddOnMetadata then
    return C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version") or "dev"
  end
  if GetAddOnMetadata then
    return GetAddOnMetadata(ADDON_NAME, "Version") or "dev"
  end
  return "dev"
end

ns.VERSION = addonVersion()

function ns.Now()
  return time and time() or 0
end

function ns.IsSecret(value)
  return issecretvalue and issecretvalue(value) or false
end

function ns.Readable(value)
  if value == nil or ns.IsSecret(value) then return nil end
  local kind = type(value)
  if kind == "string" or kind == "number" or kind == "boolean" then return value end
  return nil
end

function ns.SafeNumber(value)
  value = ns.Readable(value)
  return type(value) == "number" and value or nil
end

function ns.SafeString(value)
  value = ns.Readable(value)
  return type(value) == "string" and value or nil
end

function ns.Chat(message)
  if DEFAULT_CHAT_FRAME then
    DEFAULT_CHAT_FRAME:AddMessage("|cffffd36aDalton Dashboard:|r " .. tostring(message))
  end
end

local function pruneLegacyRegistrationErrors(errors)
  if type(errors) ~= "table" then return {} end
  local kept = {}
  for _, entry in ipairs(errors) do
    if type(entry) ~= "table" or not tostring(entry.where or ""):match("^RegisterEvent:") then
      kept[#kept + 1] = entry
    end
  end
  return kept
end

function ns.EnsureDB()
  if type(DaltonDashboardDB) ~= "table" then DaltonDashboardDB = {} end
  DaltonDashboardDB.schemaVersion = ns.SCHEMA_VERSION
  DaltonDashboardDB.settings = DaltonDashboardDB.settings or {}

  if type(DaltonDashboardCharDB) ~= "table" then DaltonDashboardCharDB = {} end
  local db = DaltonDashboardCharDB
  db.schemaVersion = ns.SCHEMA_VERSION
  db.meta = db.meta or {}
  db.meta.addonVersion = ns.VERSION
  db.meta.gameVersion, db.meta.build = GetBuildInfo()
  db.meta.interface = select(4, GetBuildInfo())
  db.meta.locale = GetLocale and GetLocale() or nil
  db.meta.lastUpdatedAt = db.meta.lastUpdatedAt or ns.Now()

  db.diagnostics = db.diagnostics or {}
  db.diagnostics.errors = pruneLegacyRegistrationErrors(db.diagnostics.errors or {})
  db.diagnostics.compatibility = db.diagnostics.compatibility or {}
  db.diagnostics.modules = db.diagnostics.modules or {}
  return db
end

function ns.GetDB()
  return ns.EnsureDB()
end

function ns.StoreSection(name, payload)
  if type(payload) ~= "table" then return end
  local db = ns.EnsureDB()
  payload.capturedAt = payload.capturedAt or ns.Now()
  db[name] = payload
  db.meta.lastUpdatedAt = payload.capturedAt
  if type(ns.RelaySectionChanged) == "function" then
    ns.RelaySectionChanged(name)
  end
end

function ns.RecordError(where, err)
  local db = ns.EnsureDB()
  local list = db.diagnostics.errors
  table.insert(list, 1, {
    at = ns.Now(),
    where = tostring(where or "?"),
    message = tostring(err or "unknown"):sub(1, 400)
  })
  while #list > 20 do table.remove(list) end
end

function ns.RecordCompatibility(where, message)
  local db = ns.EnsureDB()
  local list = db.diagnostics.compatibility
  table.insert(list, 1, {
    at = ns.Now(),
    where = tostring(where or "?"),
    message = tostring(message or "unsupported"):sub(1, 400)
  })
  while #list > 20 do table.remove(list) end
end

function ns.RegisterModule(name, module)
  module = module or {}
  module.name = name
  module.events = module.events or {}
  ns.modules[#ns.modules + 1] = module
  return module
end

function ns.Run(module, method, ...)
  if not module or type(module[method]) ~= "function" then return true end

  local started = debugprofilestop and debugprofilestop() or nil
  local ok, result = pcall(module[method], module, ...)
  local duration
  if started and debugprofilestop then
    duration = math.max(0, debugprofilestop() - started)
  end

  local db = ns.EnsureDB()
  local name = module.name or "?"
  local previous = db.diagnostics.modules[name] or {}
  local runs = (tonumber(previous.runs) or 0) + 1
  local totalDuration = (tonumber(previous.totalDurationMs) or 0) + (duration or 0)
  db.diagnostics.modules[name] = {
    at = ns.Now(),
    method = method,
    ok = ok and true or false,
    error = ok and nil or tostring(result):sub(1, 400),
    runs = runs,
    lastDurationMs = duration,
    maxDurationMs = duration and math.max(tonumber(previous.maxDurationMs) or 0, duration) or previous.maxDurationMs,
    totalDurationMs = duration and totalDuration or previous.totalDurationMs,
    averageDurationMs = duration and (totalDuration / runs) or previous.averageDurationMs
  }

  if not ok then
    ns.RecordError(name .. "." .. method, result)
    return false, result
  end
  return true, result
end

function ns.Schedule(delay, key, callback)
  ns._timers = ns._timers or {}
  if ns._timers[key] then return end
  ns._timers[key] = true

  local function run()
    ns._timers[key] = nil
    local ok, err = pcall(callback)
    if not ok then ns.RecordError("timer:" .. tostring(key), err) end
  end

  if C_Timer and C_Timer.After then
    C_Timer.After(delay or 0, run)
  else
    run()
  end
end

function ns.CopyNumberArray(source)
  local out = {}
  if type(source) ~= "table" then return out end
  for _, value in ipairs(source) do
    if type(value) == "number" and not ns.IsSecret(value) then
      out[#out + 1] = value
    end
  end
  return out
end
