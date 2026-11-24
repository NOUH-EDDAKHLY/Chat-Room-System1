# Homework 2 — Milestone 3

## Overview

Milestone 3 implements four JavaScript command-line clients for the Java SOAP chat service developed in **Homework 1, Part 2**. Each client provides a terminal menu for the chat operations while using a different approach to asynchronous programming.

## Requirements

- JDK 17 or newer to run the Homework 1 SOAP server
- Node.js 20 or newer with npm
- Bash or a compatible terminal

## Run the application

**1. Start the Java SOAP server** in the first terminal, from the repository root:

```bash
cd Homework1/part2/server
./gradlew run
```

Keep the server running. The SOAP endpoint is `http://localhost:9000/chat-room`.

**2. Open another terminal** and go to Milestone 3 from the repository root:

```bash
cd Homework2/milestone3
npm ci
```

**3. Run one JavaScript client:**

```bash
node callback-client.js
```

You can run any of the four clients instead:

```bash
node callback-client.js
node promise-client.js
node async-client.js
node promiseall-client.js
```

Run these commands **one at a time**. The client displays a menu and asks for input in the terminal. You can stop a client with `Ctrl+C`.

## JavaScript clients

| File | Approach |
| --- | --- |
| `callback-client.js` | Handles asynchronous SOAP operations with callbacks |
| `promise-client.js` | Uses Promises, `.then()`, and `.catch()` |
| `async-client.js` | Uses `async` and `await` |
| `promiseall-client.js` | Uses Promises and `Promise.all()` for concurrent operations |

## Features

The clients interact with the same SOAP service and support the main chat operations:

- Register and log in
- Create and list chat rooms
- Join a room and list its users
- Send public messages to a room
- Send private messages to another room member
- List messages
- Leave a room and log out

The `promiseall-client.js` version also includes an option to join two rooms concurrently and combine their membership counts.

## How it works

The Java SOAP server from Homework 1 manages accounts, sessions, rooms, and messages. The Node.js client sends requests to that service and displays the responses in the terminal. The four versions mainly differ in **how they handle asynchronous results**, not in the SOAP operations they provide.

Milestone 3 does not start its own Java server. The Homework 1 Part 2 server must be running first.

## Files

| File | Purpose |
| --- | --- |
| `callback-client.js` | Callback-based SOAP client |
| `promise-client.js` | Promise-based SOAP client |
| `async-client.js` | Async/await SOAP client |
| `promiseall-client.js` | Client with concurrent operations using Promise.all |
| `package.json`, `package-lock.json` | Node.js dependencies |
