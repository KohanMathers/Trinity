import * as sdk from 'matrix-js-sdk';
import { getState, setState, emit, getActiveAccount, getUserColor, saveAccounts, loadSavedAccounts } from '../store/state.js';
import { friendlyError } from '../utils/errors.js';

const clients = new Map();
const mediaObjectUrlCache = new Map();
const syncReady = new Set(); // userIds whose initial sync has completed

export async function loginWithPassword(homeserver, username, password) {
  const hs = await resolveHomeserverBaseUrl(homeserver);
  const tmp = sdk.createClient({ baseUrl: hs });
  try {
    const res = await tmp.login('m.login.password', {
      user: username, password,
      initial_device_display_name: 'Trinity',
    });
    const account = {
      userId: res.user_id,
      accessToken: res.access_token,
      deviceId: res.device_id,
      baseUrl: hs,
      displayName: null,
      avatarUrl: null,
      color: getUserColor(res.user_id),
    };
    await addAccount(account);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function resolveHomeserverBaseUrl(input) {
  const raw = (input ?? '').trim().replace(/\/+$/, '');
  if (!raw) return 'https://matrix.org';

  const hasScheme = /^https?:\/\//i.test(raw);
  const urlCandidate = hasScheme ? raw : `https://${raw}`;

  if (/_matrix\//.test(urlCandidate)) return urlCandidate;

  try {
    const origin = new URL(urlCandidate).origin;
    const res = await fetch(`${origin}/.well-known/matrix/client`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const body = await res.json();
      const discovered = body?.['m.homeserver']?.base_url;
      if (typeof discovered === 'string' && /^https?:\/\//i.test(discovered)) {
        return discovered.replace(/\/+$/, '');
      }
    }
  } catch {
    // fall through to direct URL
  }

  return urlCandidate;
}

export async function restoreSessions() {
  const saved = loadSavedAccounts();
  if (!saved || saved.accounts.length === 0) return false;
  for (const account of saved.accounts) {
    try { await addAccount(account, false); } catch { /* skip bad account */ }
  }
  if (getState().accounts.length === 0) return false;
  const idx = Math.min(saved.activeIndex, getState().accounts.length - 1);
  setState({ activeAccountIndex: idx, client: clients.get(getState().accounts[idx]?.userId) });
  return true;
}

export async function addAccount(account, setActive = true) {
  const state = getState();

  if (clients.has(account.userId)) {
    const existing = clients.get(account.userId);
    if (!existing.clientRunning) {
      attachHandlers(existing, account.userId);
      await existing.startClient({ initialSyncLimit: 30 });
    }
    return;
  }

  const client = sdk.createClient({
    baseUrl: account.baseUrl,
    accessToken: account.accessToken,
    userId: account.userId,
    deviceId: account.deviceId,
    timelineSupport: true,
    pendingEventOrdering: sdk.PendingEventOrdering.Detached,
  });

  clients.set(account.userId, client);

  try {
    const profile = await client.getProfileInfo(account.userId);
    account.displayName = profile.displayname ?? null;
    account.avatarUrl = profile.avatar_url ?? null;
  } catch { }

  const newAccounts = [...state.accounts, account];
  const newIndex = setActive ? newAccounts.length - 1 : state.activeAccountIndex;

  setState({
    accounts: newAccounts,
    activeAccountIndex: newIndex,
    client: setActive ? client : state.client,
  });

  try {
    await client.initRustCrypto();
    await client.getCrypto()?.bootstrapCrossSigning({ setupNewCrossSigning: false });
  } catch (err) {
    console.warn('Crypto init failed, continuing without E2EE:', err);
  }
  attachHandlers(client, account.userId);
  await client.startClient({ initialSyncLimit: 30 });
  saveAccounts();
}

export async function removeAccount(userId) {
  const state = getState();
  const client = clients.get(userId);
  if (client) {
    try { await client.logout(); } catch { }
    client.stopClient();
    clients.delete(userId);
  }
  const newAccounts = state.accounts.filter(a => a.userId !== userId);
  let newIndex = state.activeAccountIndex;
  if (newIndex >= newAccounts.length) newIndex = Math.max(0, newAccounts.length - 1);
  setState({
    accounts: newAccounts,
    activeAccountIndex: newIndex,
    client: newAccounts.length > 0 ? clients.get(newAccounts[newIndex]?.userId) : null,
    activeRoomId: null,
  });
  saveAccounts();
  clearMediaObjectUrlCache();
  emit('rooms-updated', getRoomList());
  if (newAccounts.length === 0) emit('logout');
}

export function switchAccount(index) {
  const state = getState();
  if (index < 0 || index >= state.accounts.length) return;
  const account = state.accounts[index];
  const client = clients.get(account.userId);
  setState({
    activeAccountIndex: index,
    client,
    activeRoomId: null,
    activeSpaceId: null,
  });
  saveAccounts();
  emit('rooms-updated', getRoomList());
}

export async function logout() {
  const state = getState();
  for (const account of [...state.accounts]) {
    await removeAccount(account.userId);
  }
  import('../store/state.js').then(m => m.clearSavedAccounts());
  clearMediaObjectUrlCache();
  emit('logout');
}

function attachHandlers(client, userId) {
  client.on('sync', (syncState) => {
    const state = getState();
    if (state.accounts[state.activeAccountIndex]?.userId === userId) {
      setState({ syncState });
    }
    if (syncState === 'PREPARED' || syncState === 'SYNCING') {
      syncReady.add(userId);
      emit('rooms-updated', getRoomList());
    }
  });

  client.on('Room.timeline', (event, room, toStartOfTimeline) => {
    if (toStartOfTimeline) return;
    emit('timeline-event', { event, room, userId });
    if (syncReady.has(userId)) maybeNotify(event, room, userId);
  });

  client.on('Room.localEchoUpdated', (event, room) => {
    if (event.getType() === 'm.reaction') {
      emit('timeline-event', { event, room, userId });
    }
  });

  client.on('Room.name', () => emit('rooms-updated', getRoomList()));
  client.on('RoomMember.typing', (event, member) => {
    const roomId = member.roomId;
    const state = getState();
    if (!state.typing.has(roomId)) state.typing.set(roomId, new Set());
    const set = state.typing.get(roomId);
    member.typing ? set.add(member.userId) : set.delete(member.userId);
    emit('typing-updated', { roomId, typers: [...set] });
  });
  client.on('RoomMember.membership', (event, member) => {
    emit('membership-changed', { member, roomId: member.roomId });
    emit('rooms-updated', getRoomList());
  });

  client.on('crypto.verificationRequestReceived', (request) => {
    emit('verification-request', request);
  });
}

function maybeNotify(event, room, userId) {
  if (event.getType() !== 'm.room.message') return;
  if (event.getSender() === userId) return;
  if (document.hasFocus()) return;
  if (localStorage.getItem('trinity_notif_desktop') !== '1') return;
  if (Notification.permission !== 'granted') return;

  const mentionOnly = localStorage.getItem('trinity_notif_mention_only') !== '0';
  if (mentionOnly) {
    const mentions = event.getContent()?.['m.mentions']?.user_ids ?? [];
    const body = event.getContent()?.body ?? '';
    const isMentioned = mentions.includes(userId) || body.includes(userId) || body.includes(userId.split(':')[0].slice(1));
    if (!isMentioned) return;
  }

  const senderName = room.getMember(event.getSender())?.name ?? event.getSender().split(':')[0].slice(1);
  const body = event.getContent()?.body ?? '';
  new Notification(senderName, {
    body: body.length > 120 ? body.slice(0, 120) + '…' : body,
    tag: room.roomId,
  });

  if (localStorage.getItem('trinity_notif_sound') === '1') {
    try {
      const ctx = new AudioContext();
      const t = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 440;
      gain1.gain.setValueAtTime(0.55, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.12);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 1046;
      gain2.gain.setValueAtTime(0, t + 0.08);
      gain2.gain.linearRampToValueAtTime(0.6, t + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.08);
      osc2.stop(t + 0.7);
    } catch { }
  }
}

function getActiveClient() {
  const state = getState();
  return state.client ?? clients.values().next().value ?? null;
}

function toHttpMediaUrl(client, mxcUri, width = null, height = null, method = 'crop') {
  if (!client || !mxcUri) return null;
  if (!mxcUri.startsWith('mxc://')) return mxcUri;
  try {
    if (width && height) {
      return client.mxcUrlToHttp(mxcUri, width, height, method, true, true, true);
    }
    return client.mxcUrlToHttp(mxcUri, undefined, undefined, undefined, true, true, true);
  } catch {
    return null;
  }
}

function clearMediaObjectUrlCache() {
  mediaObjectUrlCache.forEach(url => URL.revokeObjectURL(url));
  mediaObjectUrlCache.clear();
}

function getServerNameFromUserId(userId) {
  return userId?.split(':')[1] ?? null;
}

function updateActiveAccountPatch(patch) {
  const state = getState();
  const idx = state.activeAccountIndex;
  if (idx < 0 || idx >= state.accounts.length) return;
  const next = [...state.accounts];
  next[idx] = { ...next[idx], ...patch };
  setState({ accounts: next });
  saveAccounts();
}

export function getRoomList() {
  const state = getState();
  const client = state.client;
  if (!client) return [];

  return client.getRooms()
    .filter(r => r.getMyMembership() === 'join')
    .map(r => formatRoom(r, client))
    .sort((a, b) => (b.lastActivityTs ?? 0) - (a.lastActivityTs ?? 0));
}

function getDirectRoomIdSet(client) {
  const directIds = new Set();
  try {
    const dmMap = client.getAccountData('m.direct')?.getContent?.() ?? {};
    Object.values(dmMap).forEach(roomIds => {
      if (Array.isArray(roomIds)) roomIds.forEach(id => directIds.add(id));
    });
  } catch { /* ignore */ }
  return directIds;
}

export function getDirectRooms() {
  const client = getActiveClient();
  if (!client) return [];
  const directIds = getDirectRoomIdSet(client);

  const rooms = client.getRooms()
    .filter(room => room.getMyMembership() === 'join' && !room.isSpaceRoom())
    .filter(room => {
      if (directIds.has(room.roomId)) return true;
      return room.getJoinedMemberCount() === 2;
    })
    .map(room => formatRoom(room, client))
    .sort((a, b) => (b.lastActivityTs ?? 0) - (a.lastActivityTs ?? 0));

  return rooms;
}

export function getInvitedRooms() {
  const client = getActiveClient();
  if (!client) return [];
  return client.getRooms()
    .filter(room => room.getMyMembership() === 'invite')
    .map(room => formatRoom(room, client))
    .sort((a, b) => (b.lastActivityTs ?? 0) - (a.lastActivityTs ?? 0));
}

export function getSpaces() {
  const client = getActiveClient();
  if (!client) return [];
  return client.getRooms()
    .filter(r => r.getMyMembership() === 'join' && r.isSpaceRoom())
    .map(r => formatRoom(r, client));
}

export function getRoomsInSpace(spaceId) {
  const client = getActiveClient();
  if (!client) return [];
  const space = client.getRoom(spaceId);
  if (!space) return [];
  const childEvents = space.currentState.getStateEvents('m.space.child');
  const childIds = new Set(
    (Array.isArray(childEvents) ? childEvents : childEvents ? [childEvents] : [])
      .map(e => e.getStateKey())
      .filter(Boolean)
  );
  return client.getRooms()
    .filter(r => childIds.has(r.roomId) && r.getMyMembership() === 'join' && !r.isSpaceRoom())
    .map(r => formatRoom(r, client));
}

export function getRoomsNotInAnySpace() {
  const client = getActiveClient();
  if (!client) return [];
  const allSpaces = getSpaces();
  const inSpaceIds = new Set();
  const directIds = getDirectRoomIdSet(client);
  for (const space of allSpaces) {
    getRoomsInSpace(space.roomId).forEach(r => inSpaceIds.add(r.roomId));
  }
  return client.getRooms()
    .filter(r =>
      r.getMyMembership() === 'join'
      && !r.isSpaceRoom()
      && !inSpaceIds.has(r.roomId)
      && !directIds.has(r.roomId)
    )
    .map(r => formatRoom(r, client));
}

export function getRoomById(roomId) {
  const client = getActiveClient();
  return client?.getRoom(roomId) ?? null;
}

export function getMxcUrl(mxcUri, width = 40, height = 40) {
  const client = getActiveClient();
  return toHttpMediaUrl(client, mxcUri, width, height, 'crop');
}

export function getMxcDownloadUrl(mxcUri) {
  const client = getActiveClient();
  return toHttpMediaUrl(client, mxcUri);
}

export async function getMxcObjectUrl(mxcUri, width = null, height = null, method = 'crop') {
  const client = getActiveClient();
  const account = getActiveAccount();
  if (!client || !account || !mxcUri?.startsWith('mxc://')) return null;

  const cacheKey = `${mxcUri}|${width ?? ''}|${height ?? ''}|${method}`;
  if (mediaObjectUrlCache.has(cacheKey)) return mediaObjectUrlCache.get(cacheKey);

  const httpUrl = toHttpMediaUrl(client, mxcUri, width, height, method);
  if (!httpUrl) return null;

  try {
    const res = await fetch(httpUrl, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    mediaObjectUrlCache.set(cacheKey, objectUrl);
    return objectUrl;
  } catch {
    return null;
  }
}

export function getTimeline(roomId, limit = 60) {
  const client = getActiveClient();
  const room = client?.getRoom(roomId);
  if (!room) return [];
  return room.getLiveTimeline().getEvents()
    .slice(-limit)
    .filter(e => !e.isRedacted() && ['m.room.message', 'm.room.member', 'm.room.encrypted'].includes(e.getType()))
    .map(formatEvent)
    .filter(Boolean);
}

export async function sendRedaction(roomId, eventId) {
  const client = getActiveClient();
  if (!client) throw new Error('Not connected');
  try {
    await client.redactEvent(roomId, eventId);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function markRoomRead(roomId) {
  const client = getActiveClient();
  const room = client?.getRoom(roomId);
  if (!room) return;
  const lastEvent = room.getLiveTimeline().getEvents().slice(-1)[0];
  if (lastEvent) {
    try { await client.sendReadReceipt(lastEvent); } catch { }
  }
  setTimeout(() => emit('rooms-updated', getRoomList()), 500);
}

export async function sendMessage(roomId, body, replyToId = null) {
  const client = getActiveClient();
  if (!client) throw new Error('Not connected');
  const content = { msgtype: 'm.text', body };
  if (replyToId) {
    content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyToId } };
  }
  try {
    await client.sendEvent(roomId, 'm.room.message', content);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function sendFile(roomId, file) {
  const client = getActiveClient();
  if (!client) throw new Error('Not connected');
  if (!file) throw new Error('No file selected');

  try {
    const uploadRes = await client.uploadContent(file, {
      type: file.type || 'application/octet-stream',
      name: file.name,
      onlyContentUri: true,
    });
    const mxcUrl = typeof uploadRes === 'string' ? uploadRes : uploadRes?.content_uri;
    if (!mxcUrl) throw new Error('Upload failed');

    const msgtype = file.type.startsWith('image/')
      ? 'm.image'
      : file.type.startsWith('video/')
        ? 'm.video'
        : file.type.startsWith('audio/')
          ? 'm.audio'
          : 'm.file';

    const content = {
      msgtype,
      body: file.name,
      filename: file.name,
      url: mxcUrl,
      info: {
        mimetype: file.type || 'application/octet-stream',
        size: file.size ?? 0,
      },
    };

    await client.sendEvent(roomId, 'm.room.message', content);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export function getReactions(roomId) {
  const client = getActiveClient();
  const room = client?.getRoom(roomId);
  if (!room) return {};

  const timelineEvents = room.getLiveTimeline().getEvents();
  const timelineSet = room.getLiveTimeline().getTimelineSet();

  const manual = {};
  for (const ev of timelineEvents) {
    if (ev.getType() !== 'm.reaction') continue;
    const rel = ev.getContent()?.['m.relates_to'];
    if (rel?.rel_type === 'm.annotation' && rel.event_id && rel.key) {
      if (!manual[rel.event_id]) manual[rel.event_id] = {};
      manual[rel.event_id][rel.key] = (manual[rel.event_id][rel.key] ?? 0) + 1;
    }
  }

  const reactions = {};
  for (const msgEvent of timelineEvents) {
    if (msgEvent.getType() !== 'm.room.message') continue;
    const eventId = msgEvent.getId();

    try {
      const rels = timelineSet.getRelationsForEvent?.(eventId, 'm.annotation', 'm.reaction');
      if (rels) {
        const sorted = rels.getSortedAnnotationsByKey?.() ?? [];
        if (sorted.length) {
          reactions[eventId] = Object.fromEntries(sorted.map(([k, evSet]) => [k, evSet.size]));
          continue;
        }
      }
    } catch { }

    const chunk = msgEvent.getUnsigned()?.['m.relations']?.['m.annotation']?.chunk;
    if (chunk?.length) {
      const map = {};
      for (const { key, count } of chunk) {
        if (key && count) map[key] = count;
      }
      if (Object.keys(map).length) { reactions[eventId] = map; continue; }
    }

    if (manual[eventId]) reactions[eventId] = manual[eventId];
  }

  return reactions;
}

export async function sendReaction(roomId, eventId, emoji) {
  const client = getActiveClient();
  if (!client) throw new Error('Not connected');
  try {
    await client.sendEvent(roomId, 'm.reaction', {
      'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key: emoji },
    });
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function sendTyping(roomId, isTyping) {
  const client = getActiveClient();
  if (!client) return;
  try { await client.sendTyping(roomId, isTyping, 4000); } catch { }
}

export async function getOrCreateDirectMessageRoom(targetUserId) {
  const client = getActiveClient();
  const me = getActiveAccount()?.userId ?? null;
  if (!client) throw new Error('Not connected');
  if (!targetUserId) throw new Error('Missing user ID');
  if (targetUserId === me) throw new Error('Cannot message yourself');

  let dmMap = {};
  try {
    dmMap = client.getAccountData('m.direct')?.getContent?.() ?? {};
  } catch {
    dmMap = {};
  }

  const mappedRooms = Array.isArray(dmMap[targetUserId]) ? dmMap[targetUserId] : [];
  for (const roomId of mappedRooms) {
    const room = client.getRoom(roomId);
    if (room && room.getMyMembership() === 'join') return roomId;
  }

  const existing = client.getRooms().find(room => {
    if (room.getMyMembership() !== 'join' || room.isSpaceRoom()) return false;
    const member = room.getMember(targetUserId);
    return !!member && member.membership === 'join' && room.getJoinedMemberCount() === 2;
  });
  if (existing) return existing.roomId;

  let roomId = null;
  try {
    const res = await client.createRoom({
      is_direct: true,
      invite: [targetUserId],
      preset: 'trusted_private_chat',
      visibility: 'private',
    });
    roomId = res?.room_id ?? null;
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  if (!roomId) throw new Error('Could not create DM room');

  const updated = { ...dmMap };
  const current = Array.isArray(updated[targetUserId]) ? updated[targetUserId] : [];
  if (!current.includes(roomId)) updated[targetUserId] = [...current, roomId];
  try {
    await client.setAccountData('m.direct', updated);
  } catch {
    // Non-fatal: room still exists and can be used.
  }

  emit('rooms-updated', getRoomList());
  return roomId;
}

export async function createRoom(name, isPrivate = false, topic = '', parentSpaceId = null) {
  const client = getActiveClient();
  if (!client) return { ok: false, error: 'Not connected' };
  try {
    const res = await client.createRoom({
      name, topic,
      visibility: isPrivate ? 'private' : 'public',
      preset: isPrivate ? 'private_chat' : 'public_chat',
    });
    if (parentSpaceId) {
      await addRoomToSpace(parentSpaceId, res.room_id);
    }
    return { ok: true, roomId: res.room_id };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

export async function createSpace(name, isPrivate = true, topic = '') {
  const client = getActiveClient();
  if (!client) return { ok: false, error: 'Not connected' };
  try {
    const res = await client.createRoom({
      name,
      topic,
      visibility: isPrivate ? 'private' : 'public',
      preset: isPrivate ? 'private_chat' : 'public_chat',
      creation_content: { type: 'm.space' },
    });
    emit('rooms-updated', getRoomList());
    return { ok: true, roomId: res.room_id };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

export async function addRoomToSpace(spaceId, roomId) {
  const client = getActiveClient();
  const account = getActiveAccount();
  if (!client || !spaceId || !roomId) throw new Error('Invalid room/space');
  const via = getServerNameFromUserId(account?.userId);
  try {
    await client.sendStateEvent(spaceId, 'm.space.child', via ? { via: [via] } : {}, roomId);
    emit('rooms-updated', getRoomList());
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function inviteToRoom(roomId, userId) {
  const client = getActiveClient();
  if (!client) throw new Error('Not connected');
  if (!roomId || !userId) throw new Error('Room ID and user ID are required');
  try {
    await client.invite(roomId, userId);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function acceptRoomInvite(roomId) {
  const client = getActiveClient();
  if (!client) throw new Error('Not connected');
  if (!roomId) throw new Error('Missing room ID');
  try {
    await client.joinRoom(roomId);
    emit('rooms-updated', getRoomList());
    return { ok: true, roomId };
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function declineRoomInvite(roomId) {
  const client = getActiveClient();
  if (!client) throw new Error('Not connected');
  if (!roomId) throw new Error('Missing room ID');
  try {
    await client.leave(roomId);
    try { await client.forget(roomId); } catch { /* optional */ }
    emit('rooms-updated', getRoomList());
    return { ok: true };
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function updateRoomProfile(roomId, { name, topic, avatarFile } = {}) {
  const client = getActiveClient();
  if (!client || !roomId) throw new Error('Not connected');
  try {
    if (typeof name === 'string' && name.trim()) {
      await client.sendStateEvent(roomId, 'm.room.name', { name: name.trim() }, '');
    }
    if (typeof topic === 'string') {
      await client.sendStateEvent(roomId, 'm.room.topic', { topic: topic.trim() }, '');
    }
    if (avatarFile) {
      const uploadRes = await client.uploadContent(avatarFile, {
        type: avatarFile.type || 'application/octet-stream',
        name: avatarFile.name,
        onlyContentUri: true,
      });
      const mxcUrl = typeof uploadRes === 'string' ? uploadRes : uploadRes?.content_uri;
      if (mxcUrl) {
        await client.sendStateEvent(roomId, 'm.room.avatar', { url: mxcUrl }, '');
      }
    }
    emit('rooms-updated', getRoomList());
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function updateMyProfile({ displayName, avatarFile } = {}) {
  const client = getActiveClient();
  if (!client) throw new Error('Not connected');
  try {
    let nextAvatar = null;
    if (typeof displayName === 'string' && displayName.trim()) {
      await client.setDisplayName(displayName.trim());
    }
    if (avatarFile) {
      const uploadRes = await client.uploadContent(avatarFile, {
        type: avatarFile.type || 'application/octet-stream',
        name: avatarFile.name,
        onlyContentUri: true,
      });
      const mxcUrl = typeof uploadRes === 'string' ? uploadRes : uploadRes?.content_uri;
      if (mxcUrl) {
        await client.setAvatarUrl(mxcUrl);
        nextAvatar = mxcUrl;
      }
    }
    if (typeof displayName === 'string' && displayName.trim()) {
      updateActiveAccountPatch({ displayName: displayName.trim() });
    }
    if (nextAvatar) {
      updateActiveAccountPatch({ avatarUrl: nextAvatar });
    }
    emit('rooms-updated', getRoomList());
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function leaveRoomOrSpace(roomId) {
  const client = getActiveClient();
  if (!client || !roomId) throw new Error('Not connected');
  try {
    await client.leave(roomId);
    try { await client.forget(roomId); } catch { /* optional */ }
    const state = getState();
    const patch = {};
    if (state.activeRoomId === roomId) patch.activeRoomId = null;
    if (state.activeSpaceId === roomId) patch.activeSpaceId = null;
    if (Object.keys(patch).length) setState(patch);
    emit('rooms-updated', getRoomList());
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function loadMoreMessages(roomId) {
  const client = getActiveClient();
  const room = client?.getRoom(roomId);
  if (!room) return;
  try {
    await client.scrollback(room, 30);
    emit('timeline-scrollback', { roomId });
  } catch { }
}

export function getRoomMembers(roomId) {
  const client = getActiveClient();
  const room = client?.getRoom(roomId);
  if (!room) return [];
  return room.getJoinedMembers().map(m => ({
    userId: m.userId,
    displayName: m.name ?? m.userId,
    avatarUrl: m.getMxcAvatarUrl() ?? null,
    powerLevel: m.powerLevel ?? 0,
    membership: m.membership,
  }));
}

export function getMemberAvatarUrl(member, size = 40) {
  if (!member.avatarUrl) return null;
  return member.avatarUrl;
}

export function getEncryptionStatus(roomId) {
  const client = getActiveClient();
  if (!client) return 'unknown';
  return client.isRoomEncrypted(roomId) ? 'encrypted' : 'not-encrypted';
}

export function getMyDisplayName() {
  const state = getState();
  const account = state.accounts[state.activeAccountIndex];
  return account?.displayName ?? account?.userId?.split(':')[0].slice(1) ?? 'You';
}

function formatRoom(room, client) {
  const lastEvent = room.timeline?.[room.timeline.length - 1];
  const avatarMxc = room.getMxcAvatarUrl();
  return {
    roomId: room.roomId,
    name: room.name ?? room.roomId,
    topic: room.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic ?? '',
    memberCount: room.getJoinedMemberCount(),
    lastActivityTs: lastEvent?.getTs() ?? 0,
    unreadCount: room.getUnreadNotificationCount() ?? 0,
    isEncrypted: client.isRoomEncrypted(room.roomId),
    isSpace: room.isSpaceRoom(),
    avatarMxc,
    avatarUrl: avatarMxc ?? null,
  };
}

export function formatEvent(event) {
  const type = event.getType();
  const sender = event.getSender();
  const ts = event.getTs();
  const id = event.getId();

  if (type === 'm.room.encrypted') {
    return {
      type: 'message', eventId: id, sender,
      body: '🔒 Unable to decrypt message', msgtype: 'm.text',
      url: null, mentionedUserIds: [], ts, status: event.status, replyTo: null,
      encrypted: true,
    };
  }
  if (type === 'm.room.message') {
    const content = event.getContent();
    const relates = content['m.relates_to'];
    const replyTo = relates?.['m.in_reply_to']?.event_id ?? null;
    const mentionedUserIds = content?.['m.mentions']?.user_ids ?? [];
    return {
      type: 'message', eventId: id, sender,
      body: content.body ?? '', msgtype: content.msgtype,
      url: content.url ?? null,
      mentionedUserIds: Array.isArray(mentionedUserIds) ? mentionedUserIds : [],
      ts, status: event.status, replyTo,
    };
  }
  if (type === 'm.room.member') {
    const m = event.getContent().membership;
    const n = event.getContent().displayname ?? sender;
    if (m === 'join') return { type: 'event', eventId: id, ts, icon: '👋', text: `${n} joined` };
    if (m === 'leave') return { type: 'event', eventId: id, ts, icon: '🚪', text: `${n} left` };
    if (m === 'invite') return { type: 'event', eventId: id, ts, icon: '📨', text: `${n} was invited` };
  }
  return null;
}

export function getEventById(roomId, eventId) {
  const client = getActiveClient();
  const room = client?.getRoom(roomId);
  if (!room || !eventId) return null;
  const events = room.getLiveTimeline().getEvents();
  const ev = events.find(e => e.getId() === eventId);
  if (!ev) return null;
  const content = ev.getContent();
  const name = room.getMember(ev.getSender())?.name ?? ev.getSender().split(':')[0].slice(1);
  return { sender: ev.getSender(), senderName: name, body: content.body ?? '' };
}


export function getRoomMemberMap(roomId) {
  const members = getRoomMembers(roomId);
  return members.map(m => ({
    userId: m.userId,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl ?? null,
    color: getUserColor(m.userId),
  }));
}
