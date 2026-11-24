import { createChatStreams } from './streams.js';

const { Subject, from, of, mergeMap, catchError, map, finalize } = globalThis.rxjs;
const element = id => document.getElementById(id);
const chat = createChatStreams();
const joinRoomRequests$ = new Subject();
const joiningRooms = new Set();
const selectedRooms = new Set();
let availableRooms = [];
let token = null;
let events = null;
let roomCounts = [];
let roomMessages = [];
let isSending = false;

const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const CHAT = 'http://example.com/chatroom';
function escapeXml(text) {
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('\r', '&#13;');
}

async function soapCall(operation, args = {}) {
    const fields = Object.entries(args).map(([key, value]) =>
        `<${key}>${escapeXml(value)}</${key}>`).join('');
    const response = await fetch('/chat-room', {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
        body: `<soap:Envelope xmlns:soap="${SOAP}"><soap:Body><c:${operation} xmlns:c="${CHAT}">${fields}</c:${operation}></soap:Body></soap:Envelope>`,
        signal: AbortSignal.timeout(12000)
    });
    const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
    const read = (element, name) => element?.getElementsByTagName(name)[0]?.textContent;
    if (!response.ok) throw new Error(read(xml, 'faultstring') || `HTTP ${response.status}`);
    const result = xml.getElementsByTagNameNS(CHAT, operation + 'Response')[0];
    if (read(result, 'success') !== 'true') {
        throw new Error(read(result, 'message') || 'Invalid SOAP response.');
    }
    return { message: read(result, 'message'), token: read(result, 'token') };
}

function showStatus(text = '', error = false) {
    const box = element('status');
    box.textContent = text;
    box.hidden = !text;
    box.dataset.error = error ? 'yes' : 'no';
}

function showConnection(text, live = false) {
    element('connection').textContent = text;
    element('connection').dataset.live = live ? 'yes' : 'no';
}

function getRoomName(id) {
    return availableRooms.find(room => room.id === id)?.name || id;
}

function showRoomChoices() {
    const list = element('room-list');
    const focusId = list.contains(document.activeElement) ? document.activeElement.value : null;
    list.replaceChildren();
    for (const room of availableRooms) {
        if (chat.joinedRooms$.value.has(room.id)) {
            selectedRooms.delete(room.id);
            continue;
        }
        const label = document.createElement('label');
        label.className = 'room-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = room.id;
        checkbox.checked = selectedRooms.has(room.id);
        checkbox.disabled = joiningRooms.has(room.id);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedRooms.add(room.id);
            else selectedRooms.delete(room.id);
            element('join').disabled = !selectedRooms.size;
        });
        const caption = document.createElement('span');
        caption.textContent = room.name;
        const description = document.createElement('small');
        description.textContent = room.description;
        caption.append(description);
        label.append(checkbox, caption);
        list.append(label);
        if (focusId === room.id) checkbox.focus();
    }
    if (!list.children.length) {
        const hint = document.createElement('p');
        hint.textContent = availableRooms.length ? 'You’ve joined every room.' : 'No rooms yet.';
        list.append(hint);
    }
    element('join').disabled = !selectedRooms.size;
}

function showJoinedRooms() {
    const list = element('joined');
    const select = element('message-room');
    const previous = select.value;
    list.replaceChildren();
    select.replaceChildren();
    for (const room of roomCounts) {
        const item = document.createElement('li');
        const label = document.createElement('span');
        const name = getRoomName(room.id);
        label.textContent = name;
        const count = document.createElement('small');
        count.textContent = `${room.count} ${room.count === 1 ? 'member' : 'members'}`;
        label.append(count);
        const leave = document.createElement('button');
        leave.className = 'quiet';
        leave.textContent = 'Leave';
        leave.setAttribute('aria-label', 'Leave ' + name);
        leave.addEventListener('click', () => runAction(leave, () => soapCall('leaveRoom', { token, roomId: room.id })));
        item.append(label, leave);
        list.append(item);
        select.add(new Option(name, room.id));
    }
    if (roomCounts.some(room => room.id === previous)) select.value = previous;
    select.disabled = !roomCounts.length;
    element('send').disabled = isSending || !roomCounts.length;
    element('send-private').disabled = isSending;
}

let renderQueued = false;
function showTimeline() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
        renderQueued = false;
        const timeline = element('timeline');
        const nearBottom = timeline.scrollHeight - timeline.clientHeight - timeline.scrollTop < 25;
        timeline.replaceChildren(...roomMessages.map(message => {
            const item = document.createElement('li');
            item.dataset.messageId = message.id;
            const meta = document.createElement('div');
            meta.className = 'message-meta';
            const sender = document.createElement('strong');
            sender.textContent = message.recipient ? message.sender + ' → ' + message.recipient : message.sender;
            const room = document.createElement('span');
            room.className = 'message-room';
            room.textContent = getRoomName(message.roomId);
            const time = document.createElement('time');
            time.dateTime = message.timestamp;
            time.textContent = new Date(message.timestamp).toLocaleTimeString();
            meta.append(sender, room, time);
            if (message.recipient) meta.append('Private');
            const text = document.createElement('p');
            text.className = 'message-text';
            text.textContent = message.text;
            item.append(meta, text);
            return item;
        }));
        element('empty').hidden = roomMessages.length > 0;
        element('empty').textContent = roomCounts.length ? 'No messages in your joined rooms yet.' : 'Join a room to see its messages.';
        if (nearBottom) timeline.scrollTop = timeline.scrollHeight;
    });
}

function signOut() {
    events?.close();
    events = null;
    token = null;
    availableRooms = [];
    joiningRooms.clear();
    selectedRooms.clear();
    chat.setRooms([]);
    element('account').textContent = '';
    element('auth').hidden = false;
    element('workspace').hidden = true;
    element('logout').hidden = true;
    showConnection('Signed out');
}

function connect() {
    events?.close();
    const stream = new EventSource('/events');
    events = stream;
    stream.addEventListener('snapshot', event => {
        const snapshot = JSON.parse(event.data);
        availableRooms = snapshot.directory;
        chat.setRooms(snapshot.rooms);
        showRoomChoices();
        element('account').textContent = snapshot.username;
        showConnection('Live', true);
    });
    stream.addEventListener('directory', event => {
        availableRooms = JSON.parse(event.data);
        showRoomChoices();
    });
    stream.addEventListener('count', event => chat.updateCount(JSON.parse(event.data)));
    stream.addEventListener('chat', event => chat.addMessage(JSON.parse(event.data)));
    stream.addEventListener('signed-out', signOut);
    stream.onerror = () => {
        if (stream.readyState === EventSource.CLOSED) {
            signOut();
            showStatus('Live connection ended. Please log in again.', true);
        } else showConnection('Reconnecting…');
    };
}

async function runAction(button, work) {
    button.disabled = true;
    showStatus();
    try {
        await work();
    } catch (error) {
        showStatus(error.message, true);
    } finally {
        button.disabled = false;
    }
}

chat.counts$.subscribe(value => {
    roomCounts = value;
    showJoinedRooms();
    showTimeline();
});
chat.total$.subscribe(value => { element('total').textContent = value; });
chat.messages$.subscribe(value => {
    roomMessages = value;
    showTimeline();
});

joinRoomRequests$.pipe(mergeMap(({ id, session }) => from(soapCall('joinRoom', { roomId: id, token: session })).pipe(
    map(() => ({ session, id })),
    catchError(error => of({ session, id, error })),
    finalize(() => {
        if (session === token) {
            joiningRooms.delete(id);
            showRoomChoices();
        }
    })
), 4)).subscribe(({ session, id, error }) => {
    if (session === token && error) showStatus(`${getRoomName(id)}: ${error.message}`, true);
});

element('auth-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const operation = event.submitter?.value || 'login';
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    showStatus();
    soapCall(operation, {
        username: form.elements.username.value.trim(),
        password: form.elements.password.value
    }).then(result => {
        form.elements.password.value = '';
        if (operation === 'register') {
            showStatus('Account created. Enter your password to log in.');
            return;
        }
        if (!result.token) throw new Error('The server did not return a login token.');
        token = result.token;
        showConnection('Connecting…');
        element('auth').hidden = true;
        element('workspace').hidden = false;
        element('logout').hidden = false;
        showRoomChoices();
        connect();
    }).catch(error => showStatus(error.message, true))
        .finally(() => buttons.forEach(button => { button.disabled = false; }));
});

element('join-form').addEventListener('submit', event => {
    event.preventDefault();
    showStatus();
    const ids = [...selectedRooms];
    selectedRooms.clear();
    for (const id of ids) joiningRooms.add(id);
    showRoomChoices();
    for (const id of ids) joinRoomRequests$.next({ id, session: token });
});

element('create-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    runAction(event.submitter, async () => {
        await soapCall('createRoom', { token, name: form.elements.name.value.trim(),
            description: form.elements.description.value.trim() });
        form.reset();
        form.closest('details').open = false;
    });
});

async function sendMessage(isPrivate) {
    if (isSending) return;
    if (!token) return showStatus('Please log in first.', true);
    if (!roomCounts.length) return showStatus('Join a room before sending a message.', true);

    const form = element('message-form');
    const roomId = form.elements.room.value;
    const text = form.elements.text.value.trim();
    const recipient = form.elements.recipient.value.trim();

    if (!roomId) return showStatus('Select a joined room.', true);
    if (!text) return showStatus('Write a message first.', true);
    if (isPrivate && !recipient) {
        return showStatus('Enter the recipient username to send a private message.', true);
    }

    isSending = true;
    element('send').disabled = true;
    element('send-private').disabled = true;
    showStatus();
    try {
        if (isPrivate) {
            await soapCall('privateMessage', { token, roomId, recipient, text });
            showStatus(`Private message sent to ${recipient}.`);
        } else {
            await soapCall('broadcast', { token, roomId, text });
            showStatus('Message sent to room.');
        }
        form.elements.text.value = '';
    } catch (error) {
        showStatus(error.message, true);
    } finally {
        isSending = false;
        element('send').disabled = !roomCounts.length;
        element('send-private').disabled = false;
    }
}

element('message-form').addEventListener('submit', event => {
    event.preventDefault();
    sendMessage(false);
});

element('send-private').addEventListener('click', () => {
    sendMessage(true);
});

element('logout').addEventListener('click', event => {
    runAction(event.currentTarget, async () => {
        await soapCall('logout', { token });
        signOut();
    });
});
