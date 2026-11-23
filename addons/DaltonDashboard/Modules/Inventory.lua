local _, ns = ...
local module = ns.RegisterModule("Inventory", {})

module.events = {
  PLAYER_LOGIN = true,
  BAG_UPDATE_DELAYED = true,
  BANKFRAME_OPENED = true,
  BANKFRAME_CLOSED = true,
  PLAYERBANKSLOTS_CHANGED = true,
  PLAYER_LOGOUT = true
}

local BAG_CONTAINERS = {0, 1, 2, 3, 4}
local BANK_CONTAINERS = {-1, 5, 6, 7, 8, 9, 10, 11}
local bankOpen = false

local function containerSlots(container)
  if not (C_Container and C_Container.GetContainerNumSlots) then return nil end
  local ok, value = pcall(C_Container.GetContainerNumSlots, container)
  if not ok or ns.IsSecret(value) then return nil end
  return tonumber(value)
end

local function itemName(itemID)
  if not itemID then return nil end
  if C_Item and C_Item.GetItemInfo then
    local ok, name = pcall(C_Item.GetItemInfo, itemID)
    if ok then return ns.SafeString(name) end
  elseif GetItemInfo then
    local ok, name = pcall(GetItemInfo, itemID)
    if ok then return ns.SafeString(name) end
  end
end

local function itemInfo(container, slot)
  if not C_Container then return nil end

  local info
  if C_Container.GetContainerItemInfo then
    local ok, value = pcall(C_Container.GetContainerItemInfo, container, slot)
    if ok and type(value) == "table" then info = value end
  end

  local itemID
  if C_Container.GetContainerItemID then
    local ok, value = pcall(C_Container.GetContainerItemID, container, slot)
    if ok then itemID = ns.SafeNumber(value) end
  end
  itemID = itemID or (info and ns.SafeNumber(info.itemID))
  if not itemID then return nil end

  return {
    slot = slot,
    itemID = itemID,
    name = itemName(itemID),
    quantity = info and ns.SafeNumber(info.stackCount or info.quantity) or nil,
    quality = info and ns.SafeNumber(info.quality) or nil,
    hyperlink = info and ns.SafeString(info.hyperlink) or nil,
    iconFileID = info and ns.SafeNumber(info.iconFileID) or nil,
    isLocked = info and ns.Readable(info.isLocked) or nil,
    isReadable = info and ns.Readable(info.isReadable) or nil,
    hasLoot = info and ns.Readable(info.hasLoot) or nil,
    isFiltered = info and ns.Readable(info.isFiltered) or nil,
    hasNoValue = info and ns.Readable(info.hasNoValue) or nil,
    isBound = info and ns.Readable(info.isBound) or nil
  }
end

local function scanContainers(list)
  local containers, occupiedSlots, complete = {}, 0, true

  for _, container in ipairs(list) do
    local slots = containerSlots(container)
    if slots == nil then
      complete = false
    else
      local entry = {
        container = container,
        slots = slots,
        items = {}
      }

      if C_Container.GetContainerNumFreeSlots then
        local ok, freeSlots, bagFamily =
          pcall(C_Container.GetContainerNumFreeSlots, container)
        if ok then
          entry.freeSlots = ns.SafeNumber(freeSlots)
          entry.bagFamily = ns.SafeNumber(bagFamily)
        end
      end

      for slot = 1, slots do
        local item = itemInfo(container, slot)
        if item then
          entry.items[#entry.items + 1] = item
          occupiedSlots = occupiedSlots + 1
        end
      end

      containers[#containers + 1] = entry
    end
  end

  return {
    capturedAt = ns.Now(),
    complete = complete,
    containerCount = #containers,
    occupiedSlots = occupiedSlots,
    containers = containers
  }
end

local function storePart(part, value)
  local db = ns.GetDB()
  local inventory = type(db.inventory) == "table" and db.inventory or {}
  inventory[part] = value
  inventory.capturedAt = ns.Now()
  db.inventory = inventory
  db.meta.lastUpdatedAt = inventory.capturedAt
end

local function scanBags(reason)
  local bags = scanContainers(BAG_CONTAINERS)
  bags.reason = reason
  storePart("bags", bags)
end

local function scanBank(reason)
  if not bankOpen and reason ~= "manual" then return end
  local bank = scanContainers(BANK_CONTAINERS)
  bank.reason = reason
  bank.lastOpenedAt = ns.Now()
  storePart("bank", bank)
end

function module:Capture(reason)
  scanBags(reason or "manual")
  if bankOpen then scanBank(reason or "manual") end
end

function module:OnEvent(event)
  if event == "BANKFRAME_OPENED" then
    bankOpen = true
    scanBank(event)
    scanBags(event)
  elseif event == "BANKFRAME_CLOSED" then
    bankOpen = false
    local inventory = ns.GetDB().inventory
    if type(inventory) == "table" and type(inventory.bank) == "table" then
      inventory.bank.lastClosedAt = ns.Now()
    end
  elseif event == "PLAYERBANKSLOTS_CHANGED" then
    if bankOpen then
      ns.Schedule(0.1, "bank", function() scanBank(event) end)
    end
  elseif event == "PLAYER_LOGOUT" then
    scanBags(event)
  else
    ns.Schedule(event == "PLAYER_LOGIN" and 1.2 or 0.15, "bags", function()
      scanBags(event)
    end)
    if bankOpen then
      ns.Schedule(0.2, "bank", function() scanBank(event) end)
    end
  end
end
