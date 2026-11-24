local _, ns = ...
local module = ns.RegisterModule("Location", {})

module.events = {
  PLAYER_LOGIN = true,
  ZONE_CHANGED = true,
  ZONE_CHANGED_NEW_AREA = true,
  ZONE_CHANGED_INDOORS = true,
  PLAYER_ENTERING_WORLD = true,
  PLAYER_LOGOUT = true
}

local HISTORY_LIMIT = 200

local function safeStringCall(fn)
  if type(fn) ~= "function" then return nil end
  local ok, value = pcall(fn)
  if not ok then return nil end
  return ns.SafeString(value)
end

local function currentInstance()
  if not GetInstanceInfo then return nil end
  local ok, name, instanceType, difficultyID, difficultyName, maxPlayers,
    dynamicDifficulty, isDynamic, instanceID, instanceGroupSize, lfgDungeonID = pcall(GetInstanceInfo)
  if not ok then return nil end
  return {
    name = ns.SafeString(name),
    instanceType = ns.SafeString(instanceType),
    difficultyID = ns.SafeNumber(difficultyID),
    difficultyName = ns.SafeString(difficultyName),
    maxPlayers = ns.SafeNumber(maxPlayers),
    dynamicDifficulty = ns.SafeNumber(dynamicDifficulty),
    isDynamic = ns.Readable(isDynamic),
    instanceID = ns.SafeNumber(instanceID),
    instanceGroupSize = ns.SafeNumber(instanceGroupSize),
    lfgDungeonID = ns.SafeNumber(lfgDungeonID)
  }
end

local function mapPosition()
  if not (C_Map and C_Map.GetBestMapForUnit and C_Map.GetPlayerMapPosition) then return nil end
  local okMap, mapID = pcall(C_Map.GetBestMapForUnit, "player")
  if not okMap or type(mapID) ~= "number" or ns.IsSecret(mapID) then return nil end

  local mapInfo
  if C_Map.GetMapInfo then
    local okInfo, value = pcall(C_Map.GetMapInfo, mapID)
    if okInfo then mapInfo = value end
  end

  local pos
  local okPos, value = pcall(C_Map.GetPlayerMapPosition, mapID, "player")
  if okPos then pos = value end

  local x, y
  if pos and pos.GetXY then
    local okXY, a, b = pcall(pos.GetXY, pos)
    if okXY then x, y = ns.SafeNumber(a), ns.SafeNumber(b) end
  end

  return {
    mapID = mapID,
    mapName = mapInfo and ns.SafeString(mapInfo.name) or nil,
    x = x,
    y = y
  }
end

local function currentLocationSnapshot(reason)
  local position = mapPosition()
  return {
    capturedAt = ns.Now(),
    reason = reason,
    zone = safeStringCall(GetZoneText),
    realZone = safeStringCall(GetRealZoneText),
    subZone = safeStringCall(GetSubZoneText),
    mapID = position and position.mapID or nil,
    mapName = position and position.mapName or nil,
    x = position and position.x or nil,
    y = position and position.y or nil,
    instance = currentInstance(),
    coordinatesAvailable = position and position.x ~= nil and position.y ~= nil or false
  }
end

ns.GetCurrentLocationSnapshot = currentLocationSnapshot

local function locationFingerprint(snapshot)
  local instance = snapshot and snapshot.instance or nil
  return table.concat({
    tostring(snapshot and snapshot.mapID or ""),
    tostring(snapshot and snapshot.zone or ""),
    tostring(snapshot and snapshot.subZone or ""),
    tostring(instance and instance.instanceID or ""),
    tostring(instance and instance.difficultyID or "")
  }, "|")
end

local function appendHistory(snapshot)
  if type(snapshot) ~= "table" then return end
  local db = ns.GetDB()
  local history = type(db.locationHistory) == "table" and db.locationHistory or {}
  history.entries = type(history.entries) == "table" and history.entries or {}
  history.maxEntries = HISTORY_LIMIT

  local fingerprint = locationFingerprint(snapshot)
  local last = history.entries[#history.entries]
  if type(last) == "table" and last.fingerprint == fingerprint then
    history.capturedAt = snapshot.capturedAt or ns.Now()
    last.lastSeenAt = snapshot.capturedAt or ns.Now()
    if not last.coordinatesAvailable and snapshot.coordinatesAvailable then
      last.mapID = snapshot.mapID
      last.mapName = snapshot.mapName
      last.x = snapshot.x
      last.y = snapshot.y
      last.coordinatesAvailable = true
      last.coordinatesCapturedAt = snapshot.capturedAt or ns.Now()
    end
    db.locationHistory = history
    return
  end

  history.entries[#history.entries + 1] = {
    capturedAt = snapshot.capturedAt or ns.Now(),
    reason = snapshot.reason,
    zone = snapshot.zone,
    realZone = snapshot.realZone,
    subZone = snapshot.subZone,
    mapID = snapshot.mapID,
    mapName = snapshot.mapName,
    x = snapshot.x,
    y = snapshot.y,
    coordinatesAvailable = snapshot.coordinatesAvailable,
    instance = snapshot.instance,
    fingerprint = fingerprint
  }
  while #history.entries > HISTORY_LIMIT do table.remove(history.entries, 1) end
  history.capturedAt = snapshot.capturedAt or ns.Now()
  db.locationHistory = history
end

local function captureLocation(reason)
  local payload = currentLocationSnapshot(reason)
  if GetBindLocation then
    local ok, value = pcall(GetBindLocation)
    if ok then payload.bindLocation = ns.SafeString(value) end
  end
  payload.logout = reason == "PLAYER_LOGOUT"

  local previous = ns.GetDB().location
  if payload.coordinatesAvailable then
    payload.lastKnownCoordinates = {
      capturedAt = payload.capturedAt,
      mapID = payload.mapID,
      mapName = payload.mapName,
      x = payload.x,
      y = payload.y,
      zone = payload.zone,
      subZone = payload.subZone
    }
  elseif type(previous) == "table" and previous.lastKnownCoordinates then
    payload.lastKnownCoordinates = previous.lastKnownCoordinates
  end

  appendHistory(payload)
  ns.StoreSection("location", payload)
end

function module:Capture(reason)
  captureLocation(reason or "manual")
end

function module:OnEvent(event)
  if event == "PLAYER_LOGOUT" then
    captureLocation(event)
  else
    ns.Schedule(event == "PLAYER_LOGIN" and 0.8 or 0.15, "location", function()
      captureLocation(event)
    end)
  end
end
