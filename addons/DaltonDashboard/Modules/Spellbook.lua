local _, ns = ...
local module = ns.RegisterModule("Spellbook", {})

module.events = {
  PLAYER_LOGIN = true,
  SPELLS_CHANGED = true,
  LEARNED_SPELL_IN_TAB = true,
  PLAYER_LEVEL_UP = true
}

local function playerBank()
  return Enum and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Player
end

local function captureSpellbook(reason)
  if not (C_SpellBook and C_SpellBook.GetNumSpellBookSkillLines and C_SpellBook.GetSpellBookSkillLineInfo and C_SpellBook.GetSpellBookItemInfo) then
    error("C_SpellBook ist auf diesem Forever-Client nicht verfügbar.")
  end

  local bank = playerBank()
  if bank == nil then error("SpellBookSpellBank.Player fehlt.") end

  local lineCount = C_SpellBook.GetNumSpellBookSkillLines() or 0
  local skillLines, entries = {}, {}

  for lineIndex = 1, lineCount do
    local line = C_SpellBook.GetSpellBookSkillLineInfo(lineIndex)
    if line then
      local first = (tonumber(line.itemIndexOffset) or 0) + 1
      local count = tonumber(line.numSpellBookItems) or 0
      local lineOut = {
        index = lineIndex,
        name = ns.SafeString(line.name),
        itemIndexOffset = tonumber(line.itemIndexOffset) or 0,
        numSpellBookItems = count,
        spells = {}
      }

      for slot = first, first + count - 1 do
        local info = C_SpellBook.GetSpellBookItemInfo(slot, bank)
        if type(info) == "table" then
          local spellID = tonumber(info.spellID or info.actionID)
          local known
          if spellID and C_SpellBook.IsSpellKnown then
            local ok, value = pcall(C_SpellBook.IsSpellKnown, spellID, bank)
            if ok and not ns.IsSecret(value) then known = value and true or false end
          end
          local item = {
            slot = slot,
            skillLineIndex = lineIndex,
            skillLineName = ns.SafeString(line.name),
            itemType = ns.SafeNumber(info.itemType),
            spellID = spellID,
            actionID = ns.SafeNumber(info.actionID),
            name = ns.SafeString(info.name),
            rank = ns.SafeString(info.subName),
            iconID = ns.SafeNumber(info.iconID or info.iconFileID),
            known = known
          }
          lineOut.spells[#lineOut.spells + 1] = item
          entries[#entries + 1] = item
        end
      end
      skillLines[#skillLines + 1] = lineOut
    end
  end

  if #entries == 0 then
    error("Spellbook ist noch nicht lesbar oder enthält keine Einträge.")
  end

  ns.StoreSection("spellbook", {
    source = "C_SpellBook",
    reason = reason,
    lineCount = lineCount,
    entryCount = #entries,
    skillLines = skillLines,
    entries = entries
  })
end

function module:Capture(reason)
  captureSpellbook(reason or "manual")
end

function module:OnEvent(event)
  ns.Schedule(event == "PLAYER_LOGIN" and 1.0 or 0.25, "spellbook", function()
    captureSpellbook(event)
  end)
end
