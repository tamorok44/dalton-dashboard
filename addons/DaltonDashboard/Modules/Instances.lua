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

local function capture(reason)
  if not GetNumSavedInstances or not GetSavedInstanceInfo then
    error("Instanz-Lockout-API ist nicht verfügbar.")
  end

  local count = GetNumSavedInstances() or 0
  local entries = {}

  for index = 1, count do
    local name, lockoutID, resetSeconds, difficultyID, locked, extended,
      instanceIDMostSig, isRaid, maxPlayers, difficultyName, numEncounters,
      encounterProgress, extendDisabled, instanceID = GetSavedInstanceInfo(index)

    local encounters = {}
    local encounterCount = tonumber(numEncounters) or 0
    if GetSavedInstanceEncounterInfo then
      for encounterIndex = 1, encounterCount do
        local ok, bossName, fileDataID, isKilled =
          pcall(GetSavedInstanceEncounterInfo, index, encounterIndex)
        if ok and bossName then
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

  ns.StoreSection("instances", {
    source = "GetSavedInstanceInfo",
    reason = reason,
    count = #entries,
    entries = entries
  })
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
