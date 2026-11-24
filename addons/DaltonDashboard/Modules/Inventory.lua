local _, ns = ...
local module = ns.RegisterModule("Inventory", {})

-- Taschen und Bank sind private lokale Diagnosebereiche und gehören nicht zum
-- Dashboard-Sync. Für minimale Last werden sie ausschließlich per /dalton scan
-- erfasst und registrieren im normalen Spielbetrieb keine Events.
module.events = {}

local bankOpen = false

local function characterBankViewable()
  if C_Bank and C_Bank.CanViewBank and Enum and Enum.BankType and Enum.BankType.Character ~= nil then
    local ok, value = pcall(C_Bank.CanViewBank, Enum.BankType.Character)
    if ok and not ns.IsSecret(value) then
      return value and true or false
    end
  end
  return bankOpen
end

local function bagIndex(name, fallback)
  if Enum and Enum.BagIndex and Enum.BagIndex[name] ~= nil then
    return Enum.BagIndex[name]
  end
  return fallback
end

local BAG_CONTAINERS = {
  bagIndex("Backpack", 0),
  bagIndex("Bag_1", 1),
  bagIndex("Bag_2", 2),
  bagIndex("Bag_3", 3),
  bagIndex("Bag_4", 4),
  bagIndex("ReagentBag", 5)
}

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
  local containers, occupiedSlots, totalSlots, complete = {}, 0, 0, true

  for _, container in ipairs(list) do
    local slots = containerSlots(container)
    if slots == nil then
      complete = false
    else
      totalSlots = totalSlots + slots
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
    totalSlots = totalSlots,
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

  local backpackSlots = containerSlots(bagIndex("Backpack", 0))
  if not backpackSlots or backpackSlots <= 0 or bags.totalSlots <= 0 then
    ns.RecordCompatibility("Inventory.Bags", "Taschen waren in diesem Moment nicht lesbar; letzter gültiger Stand bleibt erhalten.")
    return false
  end

  storePart("bags", bags)
  return true
end

local function purchasedBankContainers()
  if not (C_Bank and C_Bank.FetchPurchasedBankTabData and Enum and Enum.BankType) then
    return nil
  end

  local ok, tabs = pcall(C_Bank.FetchPurchasedBankTabData, Enum.BankType.Character)
  if not ok or type(tabs) ~= "table" then return nil end

  local containers = {}
  for _, tab in ipairs(tabs) do
    if type(tab) == "table" and type(tab.ID) == "number" and not ns.IsSecret(tab.ID) then
      containers[#containers + 1] = tab.ID
    end
  end
  return containers
end

local function scanBank(reason)
  if not characterBankViewable() then return false end

  local containers = purchasedBankContainers()
  if not containers then
    ns.RecordCompatibility("Inventory.Bank", "Forever-Banktabs waren nicht lesbar; letzter gültiger Stand bleibt erhalten.")
    return false
  end

  local bank = scanContainers(containers)
  bank.reason = reason
  bank.lastOpenedAt = ns.Now()
  bank.bankType = "character"

  if #containers > 0 and bank.totalSlots <= 0 then
    ns.RecordCompatibility("Inventory.Bank", "Bank war geöffnet, lieferte aber keine lesbaren Slots; letzter gültiger Stand bleibt erhalten.")
    return false
  end

  storePart("bank", bank)
  return true
end

function module:Capture(reason)
  local why = reason or "manual"
  scanBags(why)
  scanBank(why)
end

function module:OnEvent(event)
  if event == "BANKFRAME_OPENED" then
    bankOpen = true
    ns.Schedule(0.35, "bank-open", function()
      scanBank(event)
      scanBags(event)
    end)
    ns.Schedule(1.25, "bank-open-late", function()
      scanBank(event)
    end)
  elseif event == "BANKFRAME_CLOSED" then
    bankOpen = false
    local inventory = ns.GetDB().inventory
    if type(inventory) == "table" and type(inventory.bank) == "table" then
      inventory.bank.lastClosedAt = ns.Now()
    end
  elseif event == "BANK_TABS_CHANGED" or event == "PLAYERBANKSLOTS_CHANGED" then
    ns.Schedule(0.15, "bank", function() scanBank(event) end)
  else
    ns.Schedule(event == "PLAYER_LOGIN" and 1.5 or 0.2, "bags", function()
      scanBags(event)
    end)
    if characterBankViewable() then
      ns.Schedule(0.25, "bank", function() scanBank(event) end)
    end
  end
end
