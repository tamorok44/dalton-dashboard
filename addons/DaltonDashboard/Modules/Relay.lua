local _, ns = ...
local module = ns.RegisterModule("Relay", {})

local PREFIX = "DALTONSYNC"
local HUB_NAME = "Cole Dalton"
local PROTOCOL_VERSION = 1
local CHUNK_SIZE = 200
local MAX_CHUNKS = 220
local RX_TTL = 120
local OFFLINE_RETRY_SECONDS = 300
local HISTORY_LIMIT = 30
local INTERACTION_LIMIT = 20

local TRUSTED = {
  ["cole dalton"] = true,
  ["chucky dalton"] = true,
  ["dolly dalton"] = true,
  ["viola dalton"] = true
}

module.events = {
  PLAYER_LOGIN = true,
  GROUP_ROSTER_UPDATE = true,
  CHAT_MSG_ADDON = true
}

local function canonicalName(value)
  value = tostring(value or "")
  value = value:gsub("%-", " ")
  value = value:gsub("%s+", " ")
  value = value:gsub("^%s+", ""):gsub("%s+$", "")
  return value:lower()
end

local function trusted(value)
  return TRUSTED[canonicalName(value)] == true
end

local function playerName()
  local name, second
  if UnitFullName then name, second = UnitFullName("player") end
  if not name and UnitName then name, second = UnitName("player") end
  if name and second and second ~= "" then return name .. " " .. second end
  return name
end

local function isHub()
  return canonicalName(playerName()) == canonicalName(HUB_NAME)
end

local function unitTarget(unit)
  local name, second
  if UnitFullName then name, second = UnitFullName(unit) end
  if not name and UnitName then name, second = UnitName(unit) end
  if not name then return nil end
  if second and second ~= "" then return name .. " " .. second end
  return name
end

local function groupUnits()
  local out = {}
  if IsInRaid and IsInRaid() then
    local count = GetNumGroupMembers and GetNumGroupMembers() or 0
    for index = 1, count do out[#out + 1] = "raid" .. index end
  else
    local count = GetNumSubgroupMembers and GetNumSubgroupMembers() or 0
    for index = 1, count do out[#out + 1] = "party" .. index end
  end
  return out
end

local function findGroupTarget(wanted)
  local expected = canonicalName(wanted)
  if canonicalName(playerName()) == expected then return playerName() end
  for _, unit in ipairs(groupUnits()) do
    local target = unitTarget(unit)
    if target and canonicalName(target) == expected then return target end
  end
  return nil
end

local function clone(value, depth)
  depth = depth or 0
  if depth > 20 then return nil end
  local kind = type(value)
  if kind == "string" or kind == "number" or kind == "boolean" then return value end
  if kind ~= "table" then return nil end
  local out = {}
  for key, child in pairs(value) do
    local keyType = type(key)
    if keyType == "string" or keyType == "number" then
      local copied = clone(child, depth + 1)
      if copied ~= nil then out[key] = copied end
    end
  end
  return out
end

local function tail(source, limit)
  local out = {}
  if type(source) ~= "table" then return out end
  local first = math.max(1, #source - limit + 1)
  for index = first, #source do
    local copied = clone(source[index])
    if copied ~= nil then out[#out + 1] = copied end
  end
  return out
end

local function relaySnapshot()
  local db = ns.GetDB()
  if type(db.character) ~= "table" then return nil end

  local snapshot = {
    schemaVersion = ns.SCHEMA_VERSION,
    meta = clone(db.meta) or {},
    character = clone(db.character)
  }

  if type(db.spellbook) == "table" then
    snapshot.spellbook = {
      capturedAt = db.spellbook.capturedAt,
      source = db.spellbook.source,
      entryCount = db.spellbook.entryCount,
      entries = clone(db.spellbook.entries) or {}
    }
  end

  if type(db.location) == "table" then snapshot.location = clone(db.location) end
  if type(db.locationHistory) == "table" then
    snapshot.locationHistory = {
      capturedAt = db.locationHistory.capturedAt,
      maxEntries = HISTORY_LIMIT,
      entries = tail(db.locationHistory.entries, HISTORY_LIMIT)
    }
  end
  if type(db.instances) == "table" then snapshot.instances = clone(db.instances) end
  if type(db.hunter) == "table" then snapshot.hunter = clone(db.hunter) end

  if type(db.interactions) == "table" then
    snapshot.interactions = {
      capturedAt = db.interactions.capturedAt,
      currentMerchant = clone(db.interactions.currentMerchant),
      currentTrainer = clone(db.interactions.currentTrainer),
      merchantHistory = tail(db.interactions.merchantHistory, INTERACTION_LIMIT),
      trainerHistory = tail(db.interactions.trainerHistory, INTERACTION_LIMIT)
    }
  end

  return snapshot
end

local function checksum(value)
  local hash = 5381
  for index = 1, #value do
    hash = (hash * 33 + string.byte(value, index)) % 2147483647
  end
  return string.format("%08x", hash)
end
local VOLATILE_KEYS = {
  capturedAt = true,
  reason = true,
  lastUpdatedAt = true,
  lastSeenAt = true,
  closedAt = true,
  coordinatesCapturedAt = true,
  lastOpenedAt = true,
  lastClosedAt = true,
  resetSeconds = true,
  logout = true,
  fingerprint = true
}

local function contentChecksum(value)
  local hash = 5381
  local function add(text)
    text = tostring(text or "")
    for index = 1, #text do
      hash = (hash * 33 + string.byte(text, index)) % 2147483647
    end
  end
  local function visit(current, depth)
    if depth > 24 then add("<depth>") return end
    local kind = type(current)
    add(kind)
    if kind == "nil" then return end
    if kind == "string" or kind == "number" or kind == "boolean" then
      add(":")
      add(current)
      return
    end
    if kind ~= "table" then return end

    local keys = {}
    for key in pairs(current) do
      if not (type(key) == "string" and VOLATILE_KEYS[key]) then
        keys[#keys + 1] = key
      end
    end
    table.sort(keys, function(a, b)
      local aa = type(a) .. ":" .. tostring(a)
      local bb = type(b) .. ":" .. tostring(b)
      return aa < bb
    end)
    add("{")
    for _, key in ipairs(keys) do
      add(type(key))
      add(":")
      add(key)
      add("=")
      visit(current[key], depth + 1)
      add(";")
    end
    add("}")
  end
  visit(value, 0)
  return string.format("%08x", hash)
end


local function encodeSnapshot(snapshot)
  if not (C_EncodingUtil and C_EncodingUtil.SerializeCBOR and C_EncodingUtil.CompressString and C_EncodingUtil.EncodeBase64) then
    return nil, "EncodingUtil fehlt"
  end
  local okCbor, cbor = pcall(C_EncodingUtil.SerializeCBOR, snapshot)
  if not okCbor or type(cbor) ~= "string" then return nil, "CBOR-Serialisierung fehlgeschlagen" end

  local method = Enum and Enum.CompressionMethod and Enum.CompressionMethod.Deflate or 0
  local level = Enum and Enum.CompressionLevel and Enum.CompressionLevel.OptimizeForSpeed or 1
  local okCompress, compressed = pcall(C_EncodingUtil.CompressString, cbor, method, level)
  if not okCompress or type(compressed) ~= "string" then return nil, "Komprimierung fehlgeschlagen" end

  local okBase64, encoded = pcall(C_EncodingUtil.EncodeBase64, compressed)
  if not okBase64 or type(encoded) ~= "string" then return nil, "Base64-Kodierung fehlgeschlagen" end
  return encoded
end

local function decodeSnapshot(encoded)
  if not (C_EncodingUtil and C_EncodingUtil.DecodeBase64 and C_EncodingUtil.DecompressString and C_EncodingUtil.DeserializeCBOR) then
    return nil, "EncodingUtil fehlt"
  end
  local okBase64, compressed = pcall(C_EncodingUtil.DecodeBase64, encoded)
  if not okBase64 or type(compressed) ~= "string" then return nil, "Base64-Dekodierung fehlgeschlagen" end

  local method = Enum and Enum.CompressionMethod and Enum.CompressionMethod.Deflate or 0
  local okDecompress, cbor = pcall(C_EncodingUtil.DecompressString, compressed, method)
  if not okDecompress or type(cbor) ~= "string" then return nil, "Dekomprimierung fehlgeschlagen" end

  local okCbor, value = pcall(C_EncodingUtil.DeserializeCBOR, cbor)
  if not okCbor or type(value) ~= "table" then return nil, "CBOR-Dekodierung fehlgeschlagen" end
  return value
end

local function relayState()
  local db = ns.GetDB()
  db.relay = db.relay or {}
  return db.relay
end

local function relayDiagnostics()
  local db = ns.GetDB()
  db.diagnostics.relay = db.diagnostics.relay or {}
  return db.diagnostics.relay
end

local function globalRelay()
  ns.EnsureDB()
  DaltonDashboardDB.relayInbox = DaltonDashboardDB.relayInbox or {}
  DaltonDashboardDB.relayMeta = DaltonDashboardDB.relayMeta or {}
  return DaltonDashboardDB.relayInbox, DaltonDashboardDB.relayMeta
end

local function sendMessage(target, message)
  if not (C_ChatInfo and C_ChatInfo.SendAddonMessage) then return false, "SendAddonMessage fehlt" end
  local ok, result = pcall(C_ChatInfo.SendAddonMessage, PREFIX, message, "WHISPER", target)
  if not ok then return false, result end
  local code = tonumber(result)
  if code == nil or code == 0 then return true end
  return false, code
end

local function sendAck(target, session, hash)
  sendMessage(target, "A|" .. tostring(session) .. "|" .. tostring(hash))
end

local function purgeRx()
  ns._relayRx = ns._relayRx or {}
  local now = ns.Now()
  for key, state in pairs(ns._relayRx) do
    if now - (tonumber(state.startedAt) or now) > RX_TTL then ns._relayRx[key] = nil end
  end
end

local function storeReceived(sender, payload)
  if type(payload) ~= "table" or type(payload.character) ~= "table" then return false, "Charakterdaten fehlen" end
  local name = payload.character.name
  if not trusted(name) or canonicalName(name) ~= canonicalName(sender) then
    return false, "Absender und Charakter passen nicht"
  end
  payload.inventory = nil
  payload.economy = nil
  payload.diagnostics = nil
  payload.relay = nil

  local inbox, meta = globalRelay()
  local key = canonicalName(name)
  inbox[key] = {
    receivedAt = ns.Now(),
    sender = tostring(sender),
    charDb = payload
  }
  meta.lastReceivedAt = ns.Now()
  meta.lastSender = tostring(sender)
  return true
end

local function receiveData(sender, message)
  if not isHub() or not trusted(sender) then return end
  purgeRx()

  local session, indexText, totalText, expectedHash, chunk =
    message:match("^D|([^|]+)|(%d+)|(%d+)|([^|]+)|(.*)$")
  local index, total = tonumber(indexText), tonumber(totalText)
  if not session or not index or not total or total < 1 or total > MAX_CHUNKS or index < 1 or index > total then return end
  if type(chunk) ~= "string" or #chunk > CHUNK_SIZE then return end

  ns._relayRx = ns._relayRx or {}
  local key = canonicalName(sender) .. "|" .. session
  local state = ns._relayRx[key]
  if not state then
    state = {startedAt = ns.Now(), total = total, hash = expectedHash, parts = {}, count = 0}
    ns._relayRx[key] = state
  end
  if state.total ~= total or state.hash ~= expectedHash then ns._relayRx[key] = nil return end
  if not state.parts[index] then
    state.parts[index] = chunk
    state.count = state.count + 1
  end
  if state.count < total then return end

  local parts = {}
  for part = 1, total do
    if type(state.parts[part]) ~= "string" then return end
    parts[#parts + 1] = state.parts[part]
  end
  ns._relayRx[key] = nil

  local encoded = table.concat(parts)
  if checksum(encoded) ~= expectedHash then return end
  local payload, err = decodeSnapshot(encoded)
  if not payload then ns.RecordError("Relay.Decode", err) return end

  local stored, storeErr = storeReceived(sender, payload)
  if not stored then ns.RecordError("Relay.Store", storeErr) return end
  sendAck(sender, session, expectedHash)

  local diagnostics = relayDiagnostics()
  diagnostics.lastReceivedAt = ns.Now()
  diagnostics.lastSender = tostring(sender)
  diagnostics.lastReceivedHash = expectedHash
  diagnostics.lastReceivedChunks = total
end

local function chunkPayload(encoded, session, hash)
  local chunks = {}
  for offset = 1, #encoded, CHUNK_SIZE do
    chunks[#chunks + 1] = encoded:sub(offset, offset + CHUNK_SIZE - 1)
  end
  if #chunks == 0 or #chunks > MAX_CHUNKS then return nil end
  local messages = {}
  for index, chunk in ipairs(chunks) do
    messages[index] = "D|" .. session .. "|" .. index .. "|" .. #chunks .. "|" .. hash .. "|" .. chunk
  end
  return messages
end

local function finishSend(success, detail)
  local state = relayState()
  state.lastAttemptAt = ns.Now()
  state.lastAttemptOK = success and true or false
  state.lastAttemptDetail = tostring(detail or ""):sub(1, 160)
  ns._relaySending = nil
end

local function sendChunks(target, messages, index)
  index = index or 1
  if index > #messages then
    finishSend(true, tostring(#messages) .. " Pakete gesendet; warte auf Bestätigung")
    return
  end

  local ok, result = sendMessage(target, messages[index])
  if not ok then
    local code = tonumber(result)
    if code == 3 or code == 8 then
      ns.Schedule(0.8, "relay-throttle", function() sendChunks(target, messages, index) end)
    elseif code == 12 or (Enum and Enum.SendAddonMessageResult and result == Enum.SendAddonMessageResult.TargetOffline) then
      local state = relayState()
      state.lastOfflineAt = ns.Now()
      finishSend(false, "Cole offline")
    else
      finishSend(false, "Sendefehler " .. tostring(result))
    end
    return
  end

  C_Timer.After(0.12, function() sendChunks(target, messages, index + 1) end)
end

local function trySend(force)
  if isHub() or not trusted(playerName()) or ns._relaySending then return end
  local state = relayState()
  if not force and tonumber(state.lastOfflineAt) and ns.Now() - tonumber(state.lastOfflineAt) < OFFLINE_RETRY_SECONDS then return end
  local target = findGroupTarget(HUB_NAME) or HUB_NAME

  local snapshot = relaySnapshot()
  if not snapshot then return end
  local contentHash = contentChecksum(snapshot)
  if not force and state.lastAckContentHash == contentHash then
    state.pending = false
    return
  end

  local encoded, err = encodeSnapshot(snapshot)
  if not encoded then
    ns.RecordCompatibility("Relay.Encode", err)
    return
  end

  local hash = checksum(encoded)

  local session = hash .. "-" .. tostring(ns.Now() % 10000)
  local messages = chunkPayload(encoded, session, hash)
  if not messages then
    ns.RecordError("Relay.Size", "Relay-Datensatz ist zu groß")
    return
  end

  ns._relaySending = {target = target, session = session, hash = hash, contentHash = contentHash, chunks = #messages}
  state.pending = true
  state.lastSentHash = hash
  state.lastSentContentHash = contentHash
  state.lastSentAt = ns.Now()
  state.lastSentChunks = #messages
  sendChunks(target, messages, 1)
end

local function scheduleSend(force)
  ns.Schedule(force and 1.0 or 5.0, force and "relay-force" or "relay-change", function()
    trySend(force)
  end)
end

local function requestPeers()
  if not isHub() then return end
  for _, unit in ipairs(groupUnits()) do
    local target = unitTarget(unit)
    if target and trusted(target) and canonicalName(target) ~= canonicalName(HUB_NAME) then
      sendMessage(target, "R|" .. PROTOCOL_VERSION)
    end
  end
end

function ns.RelaySectionChanged(section)
  if not ({
    character = true,
    spellbook = true,
    location = true,
    instances = true,
    hunter = true,
    interactions = true
  })[section] then return end

  local state = relayState()
  if isHub() then
    state.pending = false
    return
  end
  state.pending = true
  scheduleSend(false)
end

function module:Initialize()
  if not trusted(playerName()) then return end
  if not (C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix) then
    ns.RecordCompatibility("Relay", "C_ChatInfo AddOn-Kommunikation fehlt.")
    return
  end
  local ok, result = pcall(C_ChatInfo.RegisterAddonMessagePrefix, PREFIX)
  if not ok or result == false then
    ns.RecordCompatibility("Relay", "AddOn-Prefix konnte nicht registriert werden.")
    return
  end
  local diagnostics = relayDiagnostics()
  diagnostics.prefixRegistered = true
  diagnostics.role = isHub() and "hub" or "peer"
  if isHub() then
    local state = relayState()
    state.pending = false
    state.lastOfflineAt = nil
  end
end

function module:OnEvent(event, ...)
  if not trusted(playerName()) then return end

  if event == "CHAT_MSG_ADDON" then
    local prefix, message, channel, sender = ...
    if prefix ~= PREFIX or channel ~= "WHISPER" or not trusted(sender) then return end

    if message:match("^D|") then
      receiveData(sender, message)
      return
    end

    local session, hash = message:match("^A|([^|]+)|([^|]+)$")
    if session and hash and not isHub() and canonicalName(sender) == canonicalName(HUB_NAME) then
      local sending = ns._relaySending
      local state = relayState()
      if (sending and sending.session == session and sending.hash == hash) or state.lastSentHash == hash then
        state.lastAckHash = hash
        state.lastAckContentHash = sending and sending.contentHash or state.lastSentContentHash
        state.lastAckAt = ns.Now()
        state.pending = false
      end
      return
    end

    local version = tonumber(message:match("^R|(%d+)$"))
    if version == PROTOCOL_VERSION and not isHub() and canonicalName(sender) == canonicalName(HUB_NAME) then
      scheduleSend(true)
    end
    return
  end

  if event == "PLAYER_LOGIN" then
    ns.Schedule(4.0, "relay-login", function()
      if isHub() then requestPeers() else scheduleSend(false) end
    end)
    return
  end

  if event == "GROUP_ROSTER_UPDATE" then
    ns.Schedule(1.5, "relay-roster", function()
      if isHub() then requestPeers() else scheduleSend(false) end
    end)
  end
end

function ns.RelayStatus()
  local state = relayState()
  local inbox = DaltonDashboardDB and DaltonDashboardDB.relayInbox or {}
  local count = 0
  for _ in pairs(inbox or {}) do count = count + 1 end
  local hub = isHub()
  return {
    role = hub and "Hub" or "Peer",
    pending = hub and false or state.pending == true,
    lastAckAt = state.lastAckAt,
    lastAttemptAt = state.lastAttemptAt,
    inboxCount = count,
    targetVisible = hub or findGroupTarget(HUB_NAME) ~= nil
  }
end
