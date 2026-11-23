local _, ns = ...
local module = ns.RegisterModule("HunterPet", {})

module.events = {
  PLAYER_LOGIN = true,
  UNIT_PET = true,
  UNIT_PET_EXPERIENCE = true,
  PET_BAR_UPDATE = true,
  SPELLS_CHANGED = true,
  PET_STABLE_SHOW = true,
  PET_STABLE_UPDATE = true,
  PLAYER_LOGOUT = true
}

local function isHunter()
  local _, classFile = UnitClass("player")
  return classFile == "HUNTER"
end

local function rankNumber(value)
  if type(value) ~= "string" then return nil end
  return tonumber(value:match("(%d+)"))
end

local function petSpellCount()
  if C_SpellBook and C_SpellBook.HasPetSpells then
    local ok, value = pcall(C_SpellBook.HasPetSpells)
    if ok and type(value) == "number" and not ns.IsSecret(value) then
      return value
    end
  end
  return 0
end

local function petSpellInfo(index)
  if not C_SpellBook then return nil end
  local bank = Enum and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Pet
  if bank == nil then return nil end

  local ok, info = pcall(C_SpellBook.GetSpellBookItemInfo, index, bank)
  if not ok or type(info) ~= "table" then return nil end

  local iconID
  if C_SpellBook.GetSpellBookItemTexture then
    local okIcon, value = pcall(C_SpellBook.GetSpellBookItemTexture, index, bank)
    if okIcon then iconID = ns.SafeNumber(value) end
  end

  return {
    slot = index,
    spellID = ns.SafeNumber(info.spellID or info.actionID),
    actionID = ns.SafeNumber(info.actionID),
    name = ns.SafeString(info.name),
    rank = ns.SafeString(info.subName),
    rankNumber = rankNumber(info.subName),
    iconID = iconID or ns.SafeNumber(info.iconID or info.iconFileID)
  }
end

local function activePetAbilities()
  local out = {}
  for index = 1, petSpellCount() do
    local info = petSpellInfo(index)
    if info and info.name then out[#out + 1] = info end
  end
  return out
end

local function serializePetInfo(info)
  if type(info) ~= "table" then return nil end
  return {
    slotID = ns.SafeNumber(info.slotID),
    petNumber = ns.SafeNumber(info.petNumber),
    creatureID = ns.SafeNumber(info.creatureID),
    specID = ns.SafeNumber(info.specID),
    name = ns.SafeString(info.name),
    level = ns.SafeNumber(info.level),
    familyName = ns.SafeString(info.familyName),
    specialization = ns.SafeString(info.specialization),
    type = ns.SafeString(info.type),
    icon = ns.SafeNumber(info.icon),
    displayID = ns.SafeNumber(info.displayID),
    loyaltyLevel = ns.SafeNumber(info.loyaltyLevel),
    loyaltyName = ns.SafeString(info.loyaltyName),
    happinessLevel = ns.SafeNumber(info.happinessLevel),
    experience = ns.SafeNumber(info.experience),
    experienceNeeded = ns.SafeNumber(info.experienceNeeded),
    petAbilities = ns.CopyNumberArray(info.petAbilities),
    specAbilities = ns.CopyNumberArray(info.specAbilities),
    isFavorite = ns.Readable(info.isFavorite),
    isExotic = ns.Readable(info.isExotic)
  }
end

local function scanPetList(methodName)
  if not (C_StableInfo and type(C_StableInfo[methodName]) == "function") then return nil end

  local ok, list = pcall(C_StableInfo[methodName])
  if not ok or type(list) ~= "table" then return nil end

  local out = {}
  for _, info in ipairs(list) do
    local pet = serializePetInfo(info)
    if pet and pet.name then out[#out + 1] = pet end
  end
  return out
end

local function matchingPet(list, name, family)
  local match
  for _, pet in ipairs(list or {}) do
    if pet.name == name and pet.familyName == family then
      if match then return nil end
      match = pet
    end
  end
  return match
end

local function activePet(activePets, stabledPets)
  if not (UnitExists and UnitExists("pet")) then
    return {
      present = false,
      capturedAt = ns.Now(),
      abilities = {}
    }
  end

  local name = ns.SafeString(UnitName("pet"))
  local family = ns.SafeString(UnitCreatureFamily and UnitCreatureFamily("pet"))
  local known = matchingPet(activePets, name, family) or matchingPet(stabledPets, name, family)

  local xp, xpNeeded
  if UnitXP then
    local ok, value = pcall(UnitXP, "pet")
    if ok then xp = ns.SafeNumber(value) end
  end
  if UnitXPMax then
    local ok, value = pcall(UnitXPMax, "pet")
    if ok then xpNeeded = ns.SafeNumber(value) end
  end

  local happiness, damagePercentage, loyaltyRate
  if C_PetInfo and C_PetInfo.GetPetHappiness then
    local ok, a, b, c = pcall(C_PetInfo.GetPetHappiness)
    if ok then
      happiness = ns.SafeNumber(a)
      damagePercentage = ns.SafeNumber(b)
      loyaltyRate = ns.SafeNumber(c)
    end
  end

  local loyaltyName
  if C_PetInfo and C_PetInfo.GetPetLoyalty then
    local ok, value = pcall(C_PetInfo.GetPetLoyalty)
    if ok then loyaltyName = ns.SafeString(value) end
  end

  local trainingTotal, trainingUsed
  if C_PetInfo and C_PetInfo.GetPetTrainingPoints then
    local ok, total, used = pcall(C_PetInfo.GetPetTrainingPoints)
    if ok then
      trainingTotal = ns.SafeNumber(total)
      trainingUsed = ns.SafeNumber(used)
    end
  end

  local talentTree
  if C_PetInfo and C_PetInfo.GetPetTalentTree then
    local ok, value = pcall(C_PetInfo.GetPetTalentTree)
    if ok then talentTree = ns.SafeString(value) end
  end

  return {
    present = true,
    capturedAt = ns.Now(),
    guid = ns.SafeString(UnitGUID("pet")),
    name = name,
    level = ns.SafeNumber(UnitLevel("pet")),
    familyName = family,
    petNumber = known and known.petNumber or nil,
    creatureID = known and known.creatureID or nil,
    displayID = known and known.displayID or nil,
    icon = known and known.icon or nil,
    health = ns.SafeNumber(UnitHealth and UnitHealth("pet")),
    healthMax = ns.SafeNumber(UnitHealthMax and UnitHealthMax("pet")),
    experience = xp or (known and known.experience or nil),
    experienceNeeded = xpNeeded or (known and known.experienceNeeded or nil),
    happiness = happiness or (known and known.happinessLevel or nil),
    damagePercentage = damagePercentage,
    loyaltyRate = loyaltyRate,
    loyaltyName = loyaltyName or (known and known.loyaltyName or nil),
    loyaltyLevel = known and known.loyaltyLevel or nil,
    trainingPointsTotal = trainingTotal,
    trainingPointsUsed = trainingUsed,
    trainingPointsAvailable = trainingTotal and trainingUsed and (trainingTotal - trainingUsed) or nil,
    talentTree = talentTree,
    petAbilityIDs = known and known.petAbilities or {},
    specAbilityIDs = known and known.specAbilities or {},
    abilities = activePetAbilities()
  }
end

local function petHistoryKey(pet)
  if pet.petNumber then return "petNumber:" .. tostring(pet.petNumber) end
  return (pet.name or "?") .. "|" .. (pet.familyName or "?")
end

local function capture(reason, refreshStable)
  if not isHunter() then return end

  local db = ns.GetDB()
  local hunter = type(db.hunter) == "table" and db.hunter or {}
  hunter.capturedAt = ns.Now()
  hunter.reason = reason

  local activePets = scanPetList("GetActivePetList")
  if activePets then
    hunter.activePets = activePets
    hunter.activePetsCapturedAt = ns.Now()
  end

  if refreshStable then
    local stabledPets = scanPetList("GetStabledPetList")
    if stabledPets then
      hunter.stablePets = stabledPets
      hunter.stableCapturedAt = ns.Now()
    end
  end

  local pet = activePet(hunter.activePets, hunter.stablePets)
  hunter.activePet = pet
  hunter.observedPets = hunter.observedPets or {}

  if pet.present and pet.name then
    hunter.observedPets[petHistoryKey(pet)] = pet
  end

  db.hunter = hunter
  db.meta.lastUpdatedAt = hunter.capturedAt
end

function module:Capture(reason)
  capture(reason or "manual", true)
end

function module:OnEvent(event, unit)
  if not isHunter() then return end
  if event == "UNIT_PET" and unit and unit ~= "player" then return end

  if event == "PLAYER_LOGOUT" then
    capture(event, false)
  elseif event == "PET_STABLE_SHOW" or event == "PET_STABLE_UPDATE" then
    ns.Schedule(0.15, "hunter-stable", function()
      capture(event, true)
    end)
  else
    ns.Schedule(event == "PLAYER_LOGIN" and 1.5 or 0.2, "hunter-pet", function()
      capture(event, false)
    end)
  end
end
