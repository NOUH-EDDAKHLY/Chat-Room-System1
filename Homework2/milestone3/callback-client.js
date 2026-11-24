
const soap = require('soap');
const readline = require('readline');

const url = 'http://localhost:9000/chat-room';
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let client;
let token = null;
let roomId = null;

function ask(text, cb) {
    rl.question(text, answer => cb(answer.trim()));
}

function ask2(first, second, cb) {
    ask(first, a => {
        ask(second, b => cb(a, b));
    });
}

function call(method, data, cb) {
    client[method](data, (err, response) => {
        if (err) return cb(err, null);

        const answer = response && response.return;
        if (!answer) return cb(new Error('Invalid server response'), null);

        cb(null, {
            success: answer.success === true || answer.success === 'true',
            message: answer.message || '',
            value: answer.value ?? answer.token ?? null
        });
    });
}

function show(err, result) {
    if (err) {
        console.log('Request failed:', err.message);
    } else {
        console.log((result.success ? 'SUCCESS: ' : 'FAILED: ') + result.message);
        if (result.value != null) console.log('Value:', result.value);
    }
}

function done(err, result) {
    show(err, result);
    menu();
}

function valid(user, pass) {
    if (!user || !pass) {
        console.log('Username and password cannot be blank.');
        return false;
    }
    return true;
}

function needLogin() {
    if (!token) {
        console.log('Please log in first.');
        menu();
        return false;
    }
    return true;
}

function needRoom() {
    if (!needLogin()) return false;
    if (!roomId) {
        console.log('Please join a room first.');
        menu();
        return false;
    }
    return true;
}

function menu() {
    console.log(`
1. Register
2. Login
3. Create room
4. List rooms
5. Join room
6. List users
7. Broadcast message
8. Private message
9. List messages
10. Leave room
11. Logout
0. Exit
`);

    ask('Choose an option: ', choice => {
        switch (choice) {
            case '1':
                ask2('Username: ', 'Password: ', (user, pass) => {
                    if (!valid(user, pass)) return menu();
                    call('register', { username: user, password: pass }, done);
                });
                break;

            case '2':
                ask2('Username: ', 'Password: ', (user, pass) => {
                    if (!valid(user, pass)) return menu();
                    call('login', { username: user, password: pass }, (err, result) => {
                        if (!err && result.success && result.value) {
                            token = result.value;
                            roomId = null;
                        }
                        done(err, result);
                    });
                });
                break;

            case '3':
                if (!needLogin()) return;
                ask2('Room name: ', 'Description: ', (name, description) => {
                    call('createRoom', { token, name, description }, (err, result) => {
                        show(err, result);
                        if (!err && result.value != null) console.log('Room ID:', result.value);
                        menu();
                    });
                });
                break;

            case '4':
                if (!needLogin()) return;
                call('listRooms', { token }, done);
                break;

            case '5':
                if (!needLogin()) return;
                ask('Room ID: ', id => {
                    call('joinRoom', { token, roomId: id }, (err, result) => {
                        if (!err && result.success) roomId = id;
                        done(err, result);
                    });
                });
                break;

            case '6':
                if (!needRoom()) return;
                call('listUsers', { token, roomId }, done);
                break;

            case '7':
                if (!needRoom()) return;
                ask('Message: ', text => {
                    call('broadcast', { token, roomId, text }, done);
                });
                break;

            case '8':
                if (!needRoom()) return;
                ask2('Recipient username: ', 'Message: ', (recipient, text) => {
                    call('privateMessage', { token, roomId, recipient, text }, done);
                });
                break;

            case '9':
                if (!needRoom()) return;
                call('listMessages', { token, roomId }, done);
                break;

            case '10':
                if (!needRoom()) return;
                call('leaveRoom', { token, roomId }, (err, result) => {
                    if (!err && result.success) roomId = null;
                    done(err, result);
                });
                break;

            case '11':
                if (!needLogin()) return;
                call('logout', { token }, (err, result) => {
                    if (!err && result.success) {
                        token = null;
                        roomId = null;
                    }
                    done(err, result);
                });
                break;

            case '0':
                console.log('Client closed.');
                rl.close();
                break;

            default:
                console.log('Please choose a number from the menu.');
                menu();
        }
    });
}

soap.createClient(url + '?wsdl', { endpoint: url }, (err, service) => {
    if (err) {
        console.log('Cannot connect to SOAP server:', err.message);
        return rl.close();
    }

    client = service;
    console.log('Chat Room SOAP client');
    console.log('Server:', url);
    menu();
});
