
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

const joinedRooms = new Set();

function ask(text) {
    return new Promise(resolve => {
        rl.question(text, answer => resolve(answer.trim()));
    });
}

function ask2(first, second) {
    return ask(first).then(a =>
        ask(second).then(b => [a, b])
    );
}

function call(method, data) {
    return new Promise((resolve, reject) => {
        client[method](data, (err, response) => {
            if (err) return reject(err);

            const answer = response && response.return;

            if (!answer) {
                return reject(new Error('Invalid server response'));
            }

            resolve({
                success: answer.success === true || answer.success === 'true',
                message: answer.message || '',
                value: answer.value ?? answer.token ?? null
            });
        });
    });
}

function show(result) {
    console.log(
        (result.success ? 'SUCCESS: ' : 'FAILED: ') + result.message
    );

    if (result.value != null) {
        console.log('Value:', result.value);
    }
}

function run(promise, after) {
    promise
        .then(result => {
            show(result);
            if (after) after(result);
            menu();
        })
        .catch(err => {
            console.log('Request failed:', err.message);
            menu();
        });
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

function countUsers(result) {
    const data = result.value ?? result.message;

    if (data == null) {
        throw new Error('No user list returned');
    }

    let text = String(data).trim();

    if (!text || text === '[]' || /^no (users|members)/i.test(text)) {
        return 0;
    }

    if (/^\d+$/.test(text)) {
        return Number(text);
    }

    try {
        const list = JSON.parse(text);

        if (Array.isArray(list)) {
            return list.length;
        }

        if (list && Array.isArray(list.users)) {
            return list.users.length;
        }

        if (list && Number.isInteger(list.count)) {
            return list.count;
        }
    } catch (err) {
        // The server may return plain text.
    }

    text = text.replace(
        /^(users|members)(?: in (?:the )?room)?\s*:\s*/i,
        ''
    );

    text = text.replace(/^\[/, '').replace(/\]$/, '').trim();

    if (!text) return 0;

    if (/[,;\n\r]/.test(text)) {
        return text.split(/[,;\n\r]+/)
            .filter(name => name.trim()).length;
    }

    if (/^[a-zA-Z0-9_.-]+$/.test(text)) {
        return 1;
    }

    throw new Error('Unrecognized user list: ' + text);
}

function joinForCount(id) {
    if (joinedRooms.has(id)) {
        return Promise.resolve();
    }

    return call('joinRoom', {
        token,
        roomId: id
    }).then(result => {
        if (!result.success) {
            throw new Error(result.message);
        }

        joinedRooms.add(id);
    });
}

function joinTwoRooms(first, second) {
    if (!first || !second || first === second) {
        return Promise.reject(
            new Error('Enter two different room IDs')
        );
    }

    return Promise.all([
        joinForCount(first),
        joinForCount(second)
    ])
    .then(() => {
        return Promise.all([
            call('listUsers', { token, roomId: first }),
            call('listUsers', { token, roomId: second })
        ]);
    })
    .then(([a, b]) => {
        if (!a.success) throw new Error(a.message);
        if (!b.success) throw new Error(b.message);

        const firstCount = countUsers(a);
        const secondCount = countUsers(b);

        return {
            firstCount,
            secondCount,
            total: firstCount + secondCount
        };
    });
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
12. Join TWO rooms + total users
0. Exit
`);

    ask('Choose an option: ').then(choice => {
        switch (choice) {
            case '1':
                ask2('Username: ', 'Password: ')
                    .then(([user, pass]) => {
                        if (!valid(user, pass)) return menu();

                        run(call('register', {
                            username: user,
                            password: pass
                        }));
                    });
                break;

            case '2':
                ask2('Username: ', 'Password: ')
                    .then(([user, pass]) => {
                        if (!valid(user, pass)) return menu();

                        run(call('login', {
                            username: user,
                            password: pass
                        }), result => {
                            if (result.success && result.value) {
                                token = result.value;
                                roomId = null;
                                joinedRooms.clear();
                            }
                        });
                    });
                break;

            case '3':
                if (!needLogin()) return;

                ask2('Room name: ', 'Description: ')
                    .then(([name, description]) => {
                        run(call('createRoom', {
                            token,
                            name,
                            description
                        }), result => {
                            if (result.success && result.value != null) {
                                console.log('Room ID:', result.value);
                            }
                        });
                    });
                break;

            case '4':
                if (!needLogin()) return;

                run(call('listRooms', { token }));
                break;

            case '5':
                if (!needLogin()) return;

                ask('Room ID: ').then(id => {
                    run(call('joinRoom', {
                        token,
                        roomId: id
                    }), result => {
                        if (result.success) {
                            roomId = id;
                            joinedRooms.add(id);
                        }
                    });
                });
                break;

            case '6':
                if (!needRoom()) return;

                run(call('listUsers', { token, roomId }));
                break;

            case '7':
                if (!needRoom()) return;

                ask('Message: ').then(text => {
                    run(call('broadcast', {
                        token,
                        roomId,
                        text
                    }));
                });
                break;

            case '8':
                if (!needRoom()) return;

                ask2('Recipient username: ', 'Message: ')
                    .then(([recipient, text]) => {
                        run(call('privateMessage', {
                            token,
                            roomId,
                            recipient,
                            text
                        }));
                    });
                break;

            case '9':
                if (!needRoom()) return;

                run(call('listMessages', { token, roomId }));
                break;

            case '10':
                if (!needRoom()) return;

                run(call('leaveRoom', {
                    token,
                    roomId
                }), result => {
                    if (result.success) {
                        joinedRooms.delete(roomId);
                        roomId = null;
                    }
                });
                break;

            case '11':
                if (!needLogin()) return;

                run(call('logout', { token }), result => {
                    if (result.success) {
                        token = null;
                        roomId = null;
                        joinedRooms.clear();
                    }
                });
                break;

            case '12':
                if (!needLogin()) return;

                ask2('First room ID: ', 'Second room ID: ')
                    .then(([first, second]) => {
                        joinTwoRooms(first, second)
                            .then(counts => {
                                console.log(
                                    'Room 1: ' + counts.firstCount + ' users'
                                );
                                console.log(
                                    'Room 2: ' + counts.secondCount + ' users'
                                );
                                console.log(
                                    'TOTAL USERS: ' + counts.total
                                );

                                if (!roomId) roomId = first;
                                menu();
                            })
                            .catch(err => {
                                console.log('FAILED:', err.message);
                                menu();
                            });
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
    }).catch(err => {
        console.log('Error:', err.message);
        menu();
    });
}

new Promise((resolve, reject) => {
    soap.createClient(
        url + '?wsdl',
        { endpoint: url },
        (err, service) => {
            if (err) return reject(err);
            resolve(service);
        }
    );
})
.then(service => {
    client = service;

    console.log('Chat Room SOAP client (Promises)');
    console.log('Server:', url);

    menu();
})
.catch(err => {
    console.log('Cannot connect to SOAP server:', err.message);
    rl.close();
});
