local _, ns = ...
local module = ns.RegisterModule("HunterPet", {})

module.events = {
  PLAYER_LOGIN = true,
  UNIT_PET = true,
  UNIT_PET_EXPERIENCE = true,
  PET_BAR_UPDATE = true,
  PET_SPELL_POWER_UPDATE = true,
  SPELLS_CHANGED = true,
  LEARNED_SPELL_IN_TAB = true,
  CRAFT_SHOW = true,
  CRAFT_UPDATE = true,
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
    if ok and type(value) == "number" and not ns.IsSecret(value) then return value end
  end
  if HasPetSpells then
    local ok, value = pcall(HasPetSpells)
    if ok and type(value) == "number" and not ns.IsSecret(value) then return value end
  end
  return 0
end

local function petSpellInfo(index)
  if not C_SpellBook then return nil end
  local bank = Enum and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Pet
  if bank == nil then return nil end

  if C_SpellBook.GetSpellBookItemInfo then
    local ok, info = pcall(C_SpellBook.GetSpellBookItemInfo, index, bank)
    if ok and type(info) == "table" then
      return {
        slot = index,
        spellID = ns.SafeNumber(info.spellID or info.actionID),
        actionID = ns.SafeNumber(info.actionID),
        name = ns.SafeString(info.name),
        rank = ns.SafeString(info.subName),
        rankNumber = rankNumber(info.subName),
        iconID = ns.SafeNumber(info.iconID or info.iconFileID)
      }
    end
  end
end

local function activePetAbilities()
  local out = {}
  local count = petSpellCount()
  for index = 1, count do
    local info = petSpellInfo(index)
    if info and info.name then out[#out + 1] = info end
  end
  return out
end

local function serializeStablePet(info)
  if type(info) ~= "table" then return nil end
  return {
    slotID = ns.SafeNumber(info.slotID),
    petNumber = ns.SafeNumber(info.petNumber),
    creatureID = ns.SafeNumber(info.creatureID),
    name = ns.SafeString(info.name),
    level = ns.SafeNumber(info.level),
    familyName = ns.SafeString(info.familyName),
    type = ns.SafeString(info.type),
    icon = ns.SafeNumber(info.icon),
    displayID = ns.SafeNumber(info.displayID),
    loyaltyLevel = ns.SafeNumber(info.loyaltyLevel),
    loyaltyName = ns.SafeString(info.loyaltyName),
    happinessLevel = ns.SafeNumber(info.happinessLevel),
    experience = ns.SafeNumber(info.experience),
    experienceNeeded = ns.SafeNumber(info.experienceNeeded),
    petAbilities = ns.CopyNumberArray(info.petAbilities),
    specAbilities = ns.CopyNumberArray(info.specAbilities)
  }
end

local function scanStable()
  if not (C_StableInfo and C_StableInfo.GetStabledPetList) then return nil end
  local ok, list = pcall(C_StableInfo.GetStabledPetList)
  if not ok or type(list) ~= "table" then return nil end

  local out = {}
  for _, info in ipairs(list) do
    local pet = serializeStablePet(info)
    if pet and pet.name then out[#out + 1] = pet end
  end
  return out
end

local function matchPetNumber(stablePets, name, family)
  local found
  for _, pet in ipairs(stablePets or {}) do
    if pet.name == name and pet.familyName == family then
      if found then return nil end
      found = pet.petNumber
    end
  end
  return found
end

local function activePet(stablePets)
  if not (UnitExists and UnitExists("pet")) then
    return {
      present = false,
      capturedAt = ns.Now(),
      abilities = {}
    }
  end

  local name = ns.SafeString(UnitName("pet"))
  local family = ns.SafeString(UnitCreatureFamily and UnitCreatureFamily("pet"))

  local xp, xpNeeded
  if GetPetExperience then
    local ok, current, needed = pcall(GetPetExperience)
    if ok then
      xp, xpNeeded = ns.SafeNumber(current), ns.SafeNumber(needed)
    end
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
    petNumber = matchPetNumber(stablePets, name, family),
    icon = ns.SafeNumber(GetPetIcon and GetPetIcon()),
    health = ns.SafeNumber(UnitHealth and UnitHealth("pet")),
    healthMax = ns.SafeNumber(UnitHealthMax and UnitHealthMax("pet")),
    experience = xp,
    experienceNeeded = xpNeeded,
    happiness = happiness,
    damagePercentage = damagePercentage,
    loyaltyRate = loyaltyRate,
    talentTree = talentTree,
    abilities = activePetAbilities()
  }
end

local function scanBeastTraining()
  if not (GetNumCrafts and GetCraftInfo) then return nil end
  local line = GetCraftDisplaySkillLine and GetCraftDisplaySkillLine() or nil
  if line and line ~= "Beast Training" and line ~= (BEAST_TRAINING or "") then return nil end

  local byName, entries = {}, {}
  for index = 1, GetNumCrafts() or 0 do
    local name, subName, kind = GetCraftInfo(index)
    if name and kind ~= "header" then
      local rank = rankNumber(subName) or 1
      entries[#entries + 1] = {
        index = index,
        name = ns.SafeString(name),
        rank = ns.SafeString(subName),
        rankNumber = rank
      }
      if not byName[name] or rank > byName[name] then byName[name] = rank end
    end
  end

  if #entries == 0 then return nil end
  return {
    capturedAt = ns.Now(),
    entries = entries,
    highestRankByName = byName
  }
end

local function petHistoryKey(pet)
  if pet.petNumber then return "petNumber:" .. tostring(pet.petNumber) end
  return (pet.name or "?") .. "|" .. (pet.familyName or "?")
end

local function capture(reason, includeStable, includeTraining)
  if not isHunter() then return end

  local db = ns.GetDB()
  local hunter = type(db.hunter) == "table" and db.hunter or {}
  hunter.capturedAt = ns.Now()
  hunter.reason = reason

  local stable = includeStable and scanStable() or nil
  if stable then
    hunter.stablePets = stable
    hunter.stableCapturedAt = ns.Now()
  end

  local pet = activePet(hunter.stablePets)
  hunter.activePet = pet
  hunter.observedPets = hunter.observedPets or {}
  if pet.present and pet.name then
    hunter.observedPets[petHistoryKey(pet)] = pet
  end

  if includeTraining then
    local knowledge = scanBeastTraining()
    if knowledge then hunter.trainingKnowledge = knowledge end
  end

  db.hunter = hunter
  db.meta.lastUpdatedAt = hunter.capturedAt
end

function module:Capture(reason)
  capture(reason or "manual", true, true)
end

function module:OnEvent(event, unit)
  if not isHunter() then return end
  if event == "UNIT_PET" and unit and unit ~= "player" then return end

  if event == "PLAYER_LOGOUT" then
    capture(event, false, false)
  elseif event == "PET_STABLE_SHOW" or event == "PET_STABLE_UPDATE" then
    ns.Schedule(0.15, "hunter-stable", function()
      capture(event, true, false)
    end)
  elseif event == "CRAFT_SHOW" or event == "CRAFT_UPDATE" then
    ns.Schedule(0.1, "hunter-training", function()
      capture(event, false, true)
    end)
  else
    ns.Schedule(event == "PLAYER_LOGIN" and 1.5 or 0.2, "hunter-pet", function()
      capture(event, event == "PLAYER_LOGIN", false)
    end)
  end
end
