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
  local mapID = C_Map.GetBestMapForUnit("player")
  if type(mapID) ~= "number" or ns.IsSecret(mapID) then return nil end

  local mapInfo = C_Map.GetMapInfo and C_Map.GetMapInfo(mapID) or nil
  local pos = C_Map.GetPlayerMapPosition(mapID, "player")
  local x, y
  if pos and pos.GetXY then
    local ok, a, b = pcall(pos.GetXY, pos)
    if ok then x, y = ns.SafeNumber(a), ns.SafeNumber(b) end
  end

  return {
    mapID = mapID,
    mapName = mapInfo and ns.SafeString(mapInfo.name) or nil,
    x = x,
    y = y
  }
end

local function captureLocation(reason)
  local position = mapPosition()
  local bindLocation
  if GetBindLocation then
    local ok, value = pcall(GetBindLocation)
    if ok then bindLocation = ns.SafeString(value) end
  end

  local payload = {
    reason = reason,
    zone = ns.SafeString(GetZoneText and GetZoneText()),
    realZone = ns.SafeString(GetRealZoneText and GetRealZoneText()),
    subZone = ns.SafeString(GetSubZoneText and GetSubZoneText()),
    bindLocation = bindLocation,
    mapID = position and position.mapID or nil,
    mapName = position and position.mapName or nil,
    x = position and position.x or nil,
    y = position and position.y or nil,
    instance = currentInstance(),
    coordinatesAvailable = position and position.x ~= nil and position.y ~= nil or false,
    logout = reason == "PLAYER_LOGOUT"
  }

  local previous = ns.GetDB().location
  if payload.coordinatesAvailable then
    payload.lastKnownCoordinates = {
      capturedAt = ns.Now(),
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
