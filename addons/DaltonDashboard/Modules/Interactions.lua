local _, ns = ...
local module = ns.RegisterModule("Interactions", {})

module.events = {
  MERCHANT_SHOW = true,
  MERCHANT_UPDATE = true,
  MERCHANT_CLOSED = true,
  TRAINER_SHOW = true,
  TRAINER_UPDATE = true,
  TRAINER_CLOSED = true
}

local HISTORY_LIMIT = 80

local function interactionDiagnostics()
  local db = ns.GetDB()
  db.diagnostics = db.diagnostics or {}
  db.diagnostics.interactions = db.diagnostics.interactions or {}
  return db.diagnostics.interactions
end

local function noteEvent(event)
  local diagnostics = interactionDiagnostics()
  diagnostics.lastEvent = event
  diagnostics.lastEventAt = ns.Now()
  diagnostics.eventCount = (tonumber(diagnostics.eventCount) or 0) + 1
end

local function noteCapture(kind, ok, detail)
  local diagnostics = interactionDiagnostics()
  diagnostics["last" .. kind .. "CaptureAt"] = ns.Now()
  diagnostics["last" .. kind .. "CaptureOK"] = ok and true or false
  diagnostics["last" .. kind .. "CaptureDetail"] = tostring(detail or ""):sub(1, 240)
end

local function npcIdentity()
  local guid = ns.SafeString(UnitGUID and UnitGUID("npc"))
  local creatureID
  if guid and strsplit then
    creatureID = tonumber(select(6, strsplit("-", guid)))
  elseif guid then
    creatureID = tonumber(guid:match("^[^-]+%-[^-]+%-[^-]+%-[^-]+%-[^-]+%-(%d+)"))
  end
  return {
    guid = guid,
    id = creatureID,
    name = ns.SafeString(UnitName and UnitName("npc"))
  }
end

local function locationSnapshot(reason)
  if type(ns.GetCurrentLocationSnapshot) == "function" then
    return ns.GetCurrentLocationSnapshot(reason)
  end
end

local function merchantItemID(link)
  if type(link) ~= "string" then return nil end
  return tonumber(link:match("item:(%d+)"))
end

local function merchantFingerprint(snapshot)
  local parts = {
    tostring(snapshot.npc and snapshot.npc.id or ""),
    tostring(snapshot.count or ""),
    snapshot.complete and "1" or "0"
  }
  for _, item in ipairs(snapshot.items or {}) do
    parts[#parts + 1] = table.concat({
      tostring(item.itemID or ""),
      tostring(item.name or ""),
      tostring(item.priceCopper or ""),
      tostring(item.numAvailable or ""),
      tostring(item.stackCount or "")
    }, ":")
  end
  return table.concat(parts, "|")
end

local function trainerFingerprint(snapshot)
  local parts = {
    tostring(snapshot.npc and snapshot.npc.id or ""),
    tostring(snapshot.count or ""),
    snapshot.complete and "1" or "0"
  }
  for _, service in ipairs(snapshot.services or {}) do
    parts[#parts + 1] = table.concat({
      tostring(service.name or ""),
      tostring(service.serviceType or ""),
      tostring(service.requiredLevel or ""),
      tostring(service.requiredSkillRank or ""),
      tostring(service.priceCopper or ""),
      tostring(service.skillLine or ""),
      tostring(service.requiredSkillName or "")
    }, ":")
  end
  return table.concat(parts, "|")
end

local function storeSnapshot(kind, snapshot, fingerprint)
  local db = ns.GetDB()
  local interactions = type(db.interactions) == "table" and db.interactions or {}
  local historyKey = kind .. "History"
  local currentKey = "current" .. kind:sub(1, 1):upper() .. kind:sub(2)
  interactions[historyKey] = type(interactions[historyKey]) == "table" and interactions[historyKey] or {}

  snapshot.fingerprint = fingerprint
  interactions[currentKey] = snapshot
  interactions.capturedAt = snapshot.capturedAt or ns.Now()

  local history = interactions[historyKey]
  local last = history[#history]
  if not (type(last) == "table" and last.fingerprint == fingerprint) then
    history[#history + 1] = snapshot
    while #history > HISTORY_LIMIT do table.remove(history, 1) end
  end

  db.interactions = interactions
  db.meta.lastUpdatedAt = interactions.capturedAt
end

local function merchantInfo(index)
  if C_MerchantFrame and type(C_MerchantFrame.GetItemInfo) == "function" then
    local ok, info = pcall(C_MerchantFrame.GetItemInfo, index)
    if ok and type(info) == "table" then
      return true, {
        name = info.name,
        texture = info.texture,
        price = info.price,
        stackCount = info.stackCount,
        numAvailable = info.numAvailable,
        isPurchasable = info.isPurchasable,
        isUsable = info.isUsable,
        hasExtendedCost = info.hasExtendedCost,
        currencyID = info.currencyID,
        spellID = info.spellID,
        isQuestStartItem = info.isQuestStartItem,
        api = "C_MerchantFrame.GetItemInfo"
      }
    end
  end

  if type(GetMerchantItemInfo) == "function" then
    local ok, name, texture, price, stackCount, numAvailable, isPurchasable, isUsable, extendedCost, currencyID =
      pcall(GetMerchantItemInfo, index)
    if ok and name then
      return true, {
        name = name,
        texture = texture,
        price = price,
        stackCount = stackCount,
        numAvailable = numAvailable,
        isPurchasable = isPurchasable,
        isUsable = isUsable,
        hasExtendedCost = extendedCost,
        currencyID = currencyID,
        api = "GetMerchantItemInfo"
      }
    end
  end

  return false, nil
end

local function captureMerchant(reason)
  if type(GetMerchantNumItems) ~= "function" then
    ns.RecordCompatibility("Interactions.Merchant", "GetMerchantNumItems fehlt auf diesem Client.")
    noteCapture("Merchant", false, "GetMerchantNumItems fehlt")
    return false
  end

  local okCount, count = pcall(GetMerchantNumItems)
  if not okCount or type(count) ~= "number" or ns.IsSecret(count) then
    noteCapture("Merchant", false, "Händleranzahl nicht lesbar")
    return false
  end

  local snapshot = {
    capturedAt = ns.Now(),
    reason = reason,
    type = "merchant",
    complete = true,
    build = ns.GetDB().meta and ns.GetDB().meta.build or nil,
    gameVersion = ns.GetDB().meta and ns.GetDB().meta.gameVersion or nil,
    npc = npcIdentity(),
    location = locationSnapshot(reason),
    count = count,
    items = {}
  }

  local apiUsed
  for index = 1, count do
    local okInfo, info = merchantInfo(index)
    if not okInfo or type(info) ~= "table" then
      snapshot.complete = false
    else
      apiUsed = apiUsed or info.api
      if not ns.SafeString(info.name) then snapshot.complete = false end
      local link
      if type(GetMerchantItemLink) == "function" then
        local okLink, value = pcall(GetMerchantItemLink, index)
        if okLink then link = ns.SafeString(value) end
      end
      snapshot.items[#snapshot.items + 1] = {
        index = index,
        itemID = merchantItemID(link),
        link = link,
        name = ns.SafeString(info.name),
        texture = ns.SafeNumber(info.texture),
        priceCopper = ns.SafeNumber(info.price),
        stackCount = ns.SafeNumber(info.stackCount),
        numAvailable = ns.SafeNumber(info.numAvailable),
        isPurchasable = ns.Readable(info.isPurchasable),
        isUsable = ns.Readable(info.isUsable),
        hasExtendedCost = ns.Readable(info.hasExtendedCost),
        currencyID = ns.SafeNumber(info.currencyID),
        spellID = ns.SafeNumber(info.spellID),
        isQuestStartItem = ns.Readable(info.isQuestStartItem)
      }
    end
  end

  snapshot.api = apiUsed
  storeSnapshot("merchant", snapshot, merchantFingerprint(snapshot))
  noteCapture("Merchant", true, tostring(count) .. " Einträge über " .. tostring(apiUsed or "unbekannte API"))
  return true
end

local function captureTrainer(reason)
  if type(GetNumTrainerServices) ~= "function" or type(GetTrainerServiceInfo) ~= "function" then
    ns.RecordCompatibility("Interactions.Trainer", "Forever-Lehrerdaten sind auf diesem Client nicht vollständig lesbar.")
    noteCapture("Trainer", false, "Trainer-Grundfunktionen fehlen")
    return false
  end

  local okCount, count = pcall(GetNumTrainerServices)
  if not okCount or type(count) ~= "number" or ns.IsSecret(count) then
    noteCapture("Trainer", false, "Lehreranzahl nicht lesbar")
    return false
  end

  local snapshot = {
    capturedAt = ns.Now(),
    reason = reason,
    type = "trainer",
    complete = true,
    build = ns.GetDB().meta and ns.GetDB().meta.build or nil,
    gameVersion = ns.GetDB().meta and ns.GetDB().meta.gameVersion or nil,
    npc = npcIdentity(),
    location = locationSnapshot(reason),
    count = count,
    services = {}
  }

  if C_Trainer and C_Trainer.GetTrainerType then
    local okType, trainerType = pcall(C_Trainer.GetTrainerType)
    if okType then snapshot.trainerType = ns.Readable(trainerType) end
  end

  for index = 1, count do
    local okInfo, name, serviceType, texture, requiredLevel, serviceSubText, category =
      pcall(GetTrainerServiceInfo, index)
    if not okInfo or not name then
      snapshot.complete = false
    else
      local priceCopper, isProfession
      if type(GetTrainerServiceCost) == "function" then
        local okCost, a, b = pcall(GetTrainerServiceCost, index)
        if okCost then
          priceCopper = ns.SafeNumber(a)
          isProfession = ns.Readable(b)
        end
      end
      local skillLine
      if type(GetTrainerServiceSkillLine) == "function" then
        local okSkill, value = pcall(GetTrainerServiceSkillLine, index)
        if okSkill then skillLine = ns.SafeString(value) end
      end

      local requiredSkillName, requiredSkillRank, hasSkillRequirement
      if type(GetTrainerServiceSkillReq) == "function" then
        local okRequirement, skillName, skillRank, hasRequirement = pcall(GetTrainerServiceSkillReq, index)
        if okRequirement then
          requiredSkillName = ns.SafeString(skillName)
          requiredSkillRank = ns.SafeNumber(skillRank)
          hasSkillRequirement = ns.Readable(hasRequirement)
        end
      end

      local abilityRequirements = {}
      if type(GetTrainerServiceNumAbilityReq) == "function" and type(GetTrainerServiceAbilityReq) == "function" then
        local okRequirementCount, requirementCount = pcall(GetTrainerServiceNumAbilityReq, index)
        if okRequirementCount and type(requirementCount) == "number" and not ns.IsSecret(requirementCount) then
          for requirementIndex = 1, requirementCount do
            local okAbility, abilityName, hasAbility = pcall(GetTrainerServiceAbilityReq, index, requirementIndex)
            if okAbility and abilityName then
              abilityRequirements[#abilityRequirements + 1] = {
                name = ns.SafeString(abilityName),
                met = ns.Readable(hasAbility)
              }
            end
          end
        end
      end

      snapshot.services[#snapshot.services + 1] = {
        index = index,
        name = ns.SafeString(name),
        serviceType = ns.SafeString(serviceType),
        texture = ns.Readable(texture),
        requiredLevel = ns.SafeNumber(requiredLevel),
        serviceSubText = ns.SafeString(serviceSubText),
        category = ns.Readable(category),
        priceCopper = priceCopper,
        isProfession = isProfession,
        skillLine = skillLine,
        requiredSkillName = requiredSkillName,
        requiredSkillRank = requiredSkillRank,
        hasSkillRequirement = hasSkillRequirement,
        abilityRequirements = abilityRequirements
      }
    end
  end

  storeSnapshot("trainer", snapshot, trainerFingerprint(snapshot))
  noteCapture("Trainer", true, tostring(count) .. " Einträge")
  return true
end

local function markClosed(kind)
  local interactions = ns.GetDB().interactions
  if type(interactions) ~= "table" then return end
  local key = "current" .. kind:sub(1, 1):upper() .. kind:sub(2)
  if type(interactions[key]) == "table" then interactions[key].closedAt = ns.Now() end
end

function module:Capture(reason)
  if MerchantFrame and MerchantFrame.IsShown and MerchantFrame:IsShown() then
    captureMerchant(reason or "manual")
  end
  if ClassTrainerFrame and ClassTrainerFrame.IsShown and ClassTrainerFrame:IsShown() then
    captureTrainer(reason or "manual")
  end
end

function module:OnEvent(event)
  noteEvent(event)
  if event == "MERCHANT_CLOSED" then markClosed("merchant"); return end
  if event == "TRAINER_CLOSED" then markClosed("trainer"); return end
  if event == "MERCHANT_SHOW" or event == "MERCHANT_UPDATE" then
    ns.Schedule(event == "MERCHANT_SHOW" and 0.2 or 0.1, "interaction-merchant", function()
      captureMerchant(event)
    end)
    return
  end
  ns.Schedule(event == "TRAINER_SHOW" and 0.25 or 0.1, "interaction-trainer", function()
    captureTrainer(event)
  end)
end
