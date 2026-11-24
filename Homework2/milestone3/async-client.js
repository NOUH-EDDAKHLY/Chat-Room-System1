
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

function ask(text) {
    return new Promise(resolve => {
        rl.question(text, answer => resolve(answer.trim()));
    });
}

async function ask2(first, second) {
    const a = await ask(first);
    const b = await ask(second);
    return [a, b];
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
        return false;
    }

    return true;
}

function needRoom() {
    if (!needLogin()) return false;

    if (!roomId) {
        console.log('Please join a room first.');
        return false;
    }

    return true;
}

async function menu() {
    while (true) {
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

        const choice = await ask('Choose an option: ');

        try {
            switch (choice) {

                case '1': {
                    const [user, pass] = await ask2(
                        'Username: ',
                        'Password: '
                    );

                    if (!valid(user, pass)) break;

                    const result = await call('register', {
                        username: user,
                        password: pass
                    });

                    show(result);
                    break;
                }

                case '2': {
                    const [user, pass] = await ask2(
                        'Username: ',
                        'Password: '
                    );

                    if (!valid(user, pass)) break;

                    const result = await call('login', {
                        username: user,
                        password: pass
                    });

                    if (result.success && result.value) {
                        token = result.value;
                        roomId = null;
                    }

                    show(result);
                    break;
                }

                case '3': {
                    if (!needLogin()) break;

                    const [name, description] = await ask2(
                        'Room name: ',
                        'Description: '
                    );

                    const result = await call('createRoom', {
                        token,
                        name,
                        description
                    });

                    show(result);

                    if (result.success && result.value != null) {
                        console.log('Room ID:', result.value);
                    }

                    break;
                }

                case '4': {
                    if (!needLogin()) break;

                    const result = await call('listRooms', {
                        token
                    });

                    show(result);
                    break;
                }

                case '5': {
                    if (!needLogin()) break;

                    const id = await ask('Room ID: ');

                    const result = await call('joinRoom', {
                        token,
                        roomId: id
                    });

                    if (result.success) {
                        roomId = id;
                    }

                    show(result);
                    break;
                }

                case '6': {
                    if (!needRoom()) break;

                    const result = await call('listUsers', {
                        token,
                        roomId
                    });

                    show(result);
                    break;
                }

                case '7': {
                    if (!needRoom()) break;

                    const text = await ask('Message: ');

                    const result = await call('broadcast', {
                        token,
                        roomId,
                        text
                    });

                    show(result);
                    break;
                }

                case '8': {
                    if (!needRoom()) break;

                    const [recipient, text] = await ask2(
                        'Recipient username: ',
                        'Message: '
                    );

                    const result = await call('privateMessage', {
                        token,
                        roomId,
                        recipient,
                        text
                    });

                    show(result);
                    break;
                }

                case '9': {
                    if (!needRoom()) break;

                    const result = await call('listMessages', {
                        token,
                        roomId
                    });

                    show(result);
                    break;
                }

                case '10': {
                    if (!needRoom()) break;

                    const result = await call('leaveRoom', {
                        token,
                        roomId
                    });

                    if (result.success) {
                        roomId = null;
                    }

                    show(result);
                    break;
                }

                case '11': {
                    if (!needLogin()) break;

                    const result = await call('logout', {
                        token
                    });

                    if (result.success) {
                        token = null;
                        roomId = null;
                    }

                    show(result);
                    break;
                }

                case '0':
                    console.log('Client closed.');
                    rl.close();
                    return;

                default:
                    console.log('Please choose a number from the menu.');
            }

        } catch (err) {
            console.log('Request failed:', err.message);
        }
    }
}

function connect() {
    return new Promise((resolve, reject) => {
        soap.createClient(
            url + '?wsdl',
            { endpoint: url },
            (err, service) => {
                if (err) return reject(err);
                resolve(service);
            }
        );
    });
}

async function main() {
    try {
        client = await connect();

        console.log('Chat Room SOAP client (Async/await)');
        console.log('Server:', url);

        await menu();

    } catch (err) {
        console.log('Cannot connect to SOAP server:', err.message);
        rl.close();
    }
}

main();
