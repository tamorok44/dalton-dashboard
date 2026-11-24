local _, ns = ...
local module = ns.RegisterModule("Instances", {})

module.events = {
  PLAYER_LOGIN = true,
  UPDATE_INSTANCE_INFO = true,
  BOSS_KILL = true,
  ENCOUNTER_END = true,
  PLAYER_LOGOUT = true
}

local function requestInfo()
  if RequestRaidInfo then pcall(RequestRaidInfo) end
end

local function captureEnumerated(reason)
  if not GetNumSavedInstances or not GetSavedInstanceInfo then return nil end

  local okCount, count = pcall(GetNumSavedInstances)
  if not okCount then return nil end
  count = tonumber(count) or 0

  local entries = {}
  for index = 1, count do
    local okInfo, name, lockoutID, resetSeconds, difficultyID, locked, extended,
      instanceIDMostSig, isRaid, maxPlayers, difficultyName, numEncounters,
      encounterProgress, extendDisabled, instanceID = pcall(GetSavedInstanceInfo, index)

    if okInfo and name then
      local encounters = {}
      local encounterCount = tonumber(numEncounters) or 0

      if GetSavedInstanceEncounterInfo then
        for encounterIndex = 1, encounterCount do
          local okEncounter, bossName, fileDataID, isKilled =
            pcall(GetSavedInstanceEncounterInfo, index, encounterIndex)
          if okEncounter and bossName then
            encounters[#encounters + 1] = {
              index = encounterIndex,
              name = ns.SafeString(bossName),
              fileDataID = ns.SafeNumber(fileDataID),
              killed = ns.Readable(isKilled)
            }
          end
        end
      end

      local reset = ns.SafeNumber(resetSeconds)
      entries[#entries + 1] = {
        index = index,
        name = ns.SafeString(name),
        lockoutID = ns.SafeNumber(lockoutID),
        resetSeconds = reset,
        resetAt = reset and (ns.Now() + reset) or nil,
        difficultyID = ns.SafeNumber(difficultyID),
        difficultyName = ns.SafeString(difficultyName),
        locked = ns.Readable(locked),
        extended = ns.Readable(extended),
        instanceIDMostSig = ns.SafeNumber(instanceIDMostSig),
        isRaid = ns.Readable(isRaid),
        maxPlayers = ns.SafeNumber(maxPlayers),
        numEncounters = ns.SafeNumber(numEncounters),
        encounterProgress = ns.SafeNumber(encounterProgress),
        extendDisabled = ns.Readable(extendDisabled),
        instanceID = ns.SafeNumber(instanceID),
        encounters = encounters
      }
    end
  end

  return {
    source = "GetSavedInstanceInfo",
    scope = "all-saved-instances",
    enumerationAvailable = true,
    reason = reason,
    count = #entries,
    entries = entries
  }
end

local function captureCurrent(reason)
  local inInstance, instanceType = false, nil
  if IsInInstance then
    local ok, a, b = pcall(IsInInstance)
    if ok then
      inInstance = a and true or false
      instanceType = ns.SafeString(b)
    end
  end

  local instance
  if GetInstanceInfo then
    local ok, name, currentType, difficultyID, difficultyName, maxPlayers,
      dynamicDifficulty, isDynamic, instanceID, instanceGroupSize, lfgDungeonID =
      pcall(GetInstanceInfo)
    if ok then
      instance = {
        name = ns.SafeString(name),
        instanceType = ns.SafeString(currentType),
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
  end

  local lock
  if inInstance and GetInstanceLockTimeRemaining then
    local ok, timeLeft, extending, encountersTotal, encountersCompleted =
      pcall(GetInstanceLockTimeRemaining)
    if ok then
      local encounters = {}
      local total = tonumber(encountersTotal) or 0
      if GetInstanceLockTimeRemainingEncounter then
        for index = 1, total do
          local okEncounter, encounterName, texture, isKilled, ineligible =
            pcall(GetInstanceLockTimeRemainingEncounter, index)
          if okEncounter and encounterName then
            encounters[#encounters + 1] = {
              index = index,
              name = ns.SafeString(encounterName),
              texture = ns.SafeString(texture),
              killed = ns.Readable(isKilled),
              ineligible = ns.Readable(ineligible)
            }
          end
        end
      end

      local remaining = ns.SafeNumber(timeLeft)
      lock = {
        resetSeconds = remaining,
        resetAt = remaining and remaining > 0 and (ns.Now() + remaining) or nil,
        extending = ns.Readable(extending),
        encountersTotal = ns.SafeNumber(encountersTotal),
        encountersCompleted = ns.SafeNumber(encountersCompleted),
        encounters = encounters
      }
    end
  end

  local entries = {}
  if inInstance and instance then
    local entry = {}
    for key, value in pairs(instance) do entry[key] = value end
    entry.lock = lock
    entries[1] = entry
  end

  return {
    source = "GetInstanceLockTimeRemaining",
    scope = "current-instance-only",
    enumerationAvailable = false,
    reason = reason,
    inInstance = inInstance,
    instanceType = instanceType,
    count = #entries,
    entries = entries,
    current = instance,
    currentLock = lock
  }
end

local function capture(reason)
  local payload = captureEnumerated(reason) or captureCurrent(reason)
  ns.StoreSection("instances", payload)
end

function module:Capture(reason)
  requestInfo()
  capture(reason or "manual")
end

function module:OnEvent(event)
  if event == "PLAYER_LOGOUT" or event == "UPDATE_INSTANCE_INFO" then
    capture(event)
    return
  end

  requestInfo()
  ns.Schedule(event == "PLAYER_LOGIN" and 2.0 or 1.0, "instances", function()
    capture(event)
  end)
end
