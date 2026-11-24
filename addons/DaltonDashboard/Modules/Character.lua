local _, ns = ...
local module = ns.RegisterModule("Character", {})

module.events = {
  PLAYER_LOGIN = true,
  PLAYER_LEVEL_UP = true
}

local function captureCharacter(reason)
  local name, second
  if UnitFullName then name, second = UnitFullName("player") end
  if not name and UnitName then name, second = UnitName("player") end

  local fullName = name
  if name and second and second ~= "" then
    fullName = name .. " " .. second
  end
  local realm = GetRealmName and GetRealmName() or nil

  local className, classFile, classID = UnitClass("player")
  local raceName, raceFile, raceID = UnitRace("player")

  ns.StoreSection("character", {
    reason = reason,
    name = ns.SafeString(fullName),
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
  captureCharacter(event)
end
