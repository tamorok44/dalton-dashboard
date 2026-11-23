local ADDON_NAME = ...

local function chat(message)
  DEFAULT_CHAT_FRAME:AddMessage("|cffffd36aDalton Dashboard:|r "..tostring(message))
end

local function encode(value)
  return (tostring(value or ""):gsub("([^%w%-_%.~])", function(char)
    return string.format("%%%02X", string.byte(char))
  end))
end

local function slug(value)
  local text = string.lower(tostring(value or ""))
  text = text:gsub("[^a-z0-9]+", "-")
  text = text:gsub("^%-+", ""):gsub("%-+$", "")
  return text
end

local function collectSpellbook()
  local spells, seen = {}, {}
  if not C_SpellBook or not C_SpellBook.GetNumSpellBookSkillLines or not C_SpellBook.GetSpellBookSkillLineInfo or not C_SpellBook.GetSpellBookItemInfo then
    error("Die Forever-Spellbook-API ist nicht verfügbar.")
  end
  local bank = Enum.SpellBookSpellBank.Player
  local spellType = Enum.SpellBookItemType.Spell
  local lines = C_SpellBook.GetNumSpellBookSkillLines() or 0
  -- SkillLine 1 ist der allgemeine Reiter. Berufsreiter liegen außerhalb dieser Klassen-SkillLines.
  for lineIndex = 2, lines do
    local line = C_SpellBook.GetSpellBookSkillLineInfo(lineIndex)
    if line then
      local first = (line.itemIndexOffset or 0) + 1
      local last = (line.itemIndexOffset or 0) + (line.numSpellBookItems or 0)
      for slot = first, last do
        local info = C_SpellBook.GetSpellBookItemInfo(slot, bank)
        if info and info.itemType == spellType then
          local id = tonumber(info.spellID or info.actionID)
          local known = id and (not C_SpellBook.IsSpellKnown or C_SpellBook.IsSpellKnown(id, bank))
          if known and id and id > 0 and not seen[id] then
            seen[id] = true
            spells[#spells+1] = {
              id = id,
              name = info.name or "",
              rank = info.subName or ""
            }
          end
        end
      end
    end
  end
  table.sort(spells, function(a,b) return a.id < b.id end)
  return spells
end

local function buildCode()
  if type(DALTON_DASHBOARD_SYNC_TOKEN) ~= "string" or DALTON_DASHBOARD_SYNC_TOKEN == "" or DALTON_DASHBOARD_SYNC_TOKEN == "PRIVATE_TOKEN_HERE" then
    error("Der private Sync-Schlüssel fehlt in Config.lua.")
  end
  local name = UnitName("player")
  local _, _, classId = UnitClass("player")
  local level = UnitLevel("player")
  if not name or not classId or not level then error("Charakterdaten sind noch nicht verfügbar.") end
  local records = {}
  for _, spell in ipairs(collectSpellbook()) do
    records[#records+1] = tostring(spell.id)..":"..encode(spell.name)..":"..encode(spell.rank)
  end
  if #records == 0 then error("Keine Klassenfähigkeiten im Spellbook gefunden.") end
  return table.concat({
    "DALTON1",
    DALTON_DASHBOARD_SYNC_TOKEN,
    slug(name),
    tostring(classId),
    tostring(level),
    tostring(time()),
    table.concat(records, ",")
  }, "|"), #records
end

local frame
local function showExport()
  local ok, code, count = pcall(buildCode)
  if not ok then chat(code); return end
  if not frame then
    frame = CreateFrame("Frame", "DaltonDashboardSpellbookFrame", UIParent)
    frame:SetSize(720, 270)
    frame:SetPoint("CENTER")
    frame:SetFrameStrata("DIALOG")
    frame:SetMovable(true)
    frame:EnableMouse(true)
    frame:RegisterForDrag("LeftButton")
    frame:SetScript("OnDragStart", frame.StartMoving)
    frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
    frame:SetClampedToScreen(true)

    local bg = frame:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0.035, 0.027, 0.018, 0.96)

    local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
    title:SetPoint("TOPLEFT", 18, -18)
    title:SetText("Dalton Dashboard · Spellbook Sync")

    local note = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    note:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -8)
    note:SetText("Code kopieren und im Dashboard unter Klassenfähigkeiten einfügen.")
    frame.note = note

    local edit = CreateFrame("EditBox", nil, frame, "InputBoxTemplate")
    edit:SetMultiLine(true)
    edit:SetAutoFocus(true)
    edit:SetFontObject(ChatFontNormal)
    edit:SetSize(680, 145)
    edit:SetPoint("TOPLEFT", note, "BOTTOMLEFT", 0, -14)
    edit:SetTextInsets(8, 8, 8, 8)
    edit:SetScript("OnEscapePressed", function(self) self:ClearFocus(); frame:Hide() end)
    frame.edit = edit

    local close = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
    close:SetSize(100, 24)
    close:SetPoint("BOTTOMRIGHT", -18, 14)
    close:SetText("Schließen")
    close:SetScript("OnClick", function() frame:Hide() end)
  end
  frame.note:SetText("Gefundene Klassenfähigkeiten: "..count.." · Code kopieren und im Dashboard einfügen.")
  frame.edit:SetText(code)
  frame.edit:HighlightText()
  frame:Show()
  frame.edit:SetFocus()
  chat(count.." Klassenfähigkeiten aus dem echten Spellbook erfasst.")
end

SLASH_DALTONDASHBOARD1 = "/dalton"
SLASH_DALTONDASHBOARD2 = "/daltonsync"
SlashCmdList.DALTONDASHBOARD = function()
  showExport()
end

chat("geladen. /dalton öffnet den privaten Spellbook-Sync.")
