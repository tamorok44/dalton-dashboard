local _, ns = ...
local module = ns.RegisterModule("Character", {})

module.events = {
  PLAYER_LOGIN = true,
  PLAYER_LEVEL_UP = true,
  PLAYER_MONEY = true
}

local function captureCharacter(reason)
  local name, realm
  if UnitFullName then name, realm = UnitFullName("player") end
  name = name or (UnitName and UnitName("player"))
  realm = realm or (GetRealmName and GetRealmName())

  local className, classFile, classID = UnitClass("player")
  local raceName, raceFile, raceID = UnitRace("player")

  ns.StoreSection("character", {
    reason = reason,
    name = ns.SafeString(name),
    realm = ns.SafeString(realm),
    guid = ns.SafeString(UnitGUID and UnitGUID("player")),
    className = ns.SafeString(className),
    classFile = ns.SafeString(classFile),
    classID = ns.SafeNumber(classID),
    raceName = ns.SafeString(raceName),
    raceFile = ns.SafeString(raceFile),
    raceID = ns.SafeNumber(raceID),
    faction = ns.SafeString(UnitFactionGroup and UnitFactionGroup("player")),
    level = ns.SafeNumber(UnitLevel and UnitLevel("player"))
  })
end

local function captureEconomy(reason)
  local money
  if GetMoney then
    local ok, value = pcall(GetMoney)
    if ok then money = ns.SafeNumber(value) end
  end

  ns.StoreSection("economy", {
    reason = reason,
    source = "GetMoney",
    moneyCopper = money
  })
end

function module:Capture(reason)
  captureCharacter(reason or "manual")
  captureEconomy(reason or "manual")
end

function module:OnEvent(event)
  if event == "PLAYER_MONEY" then
    captureEconomy(event)
  else
    self:Capture(event)
  end
end
