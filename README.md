# Chat Room System

This repository contains Homework 1 and Homework 2 for a chat room application. The project starts with Java networking, then uses a Java SOAP service with JavaScript clients, and finally adds a browser interface with live updates using RxJS.

## Project structure

| Folder | Description |
| --- | --- |
| `Homework1/part1/` | Basic Java socket-based client and server |
| `Homework1/part2/` | Java SOAP chat service and Java client |
| `Homework2/milestone3/` | Four Node.js clients using different asynchronous JavaScript approaches |
| `Homework2/milestone4/` | Browser chat application using RxJS, SOAP, and Server-Sent Events (SSE) |

## Requirements

- JDK 17 or newer
- Node.js 20 or newer with npm
- Bash (Linux or a compatible terminal)

## Homework 1

**Part 1:** A basic Java client/server implementation using sockets. The source files and design material are in `Homework1/part1/`.

**Part 2:** A Java SOAP chat service that supports registration, login, room creation, room membership, messaging, and logout. The Java server and client are in `Homework1/part2/`.

To start the SOAP server:

```bash
cd Homework1/part2/server
./gradlew run
```

Keep this terminal running while using the Milestone 3 clients. See the README files in `Homework1/` for more details.

## Homework 2 — Milestone 3

Milestone 3 contains four command-line clients for the **Homework 1 Part 2 SOAP server**. Each client uses a different JavaScript asynchronous programming approach:

- `callback-client.js` — callbacks
- `promise-client.js` — Promises with `.then()` and `.catch()`
- `async-client.js` — `async`/`await`
- `promiseall-client.js` — concurrent operations using `Promise.all()`

After starting the Homework 1 Part 2 server in a separate terminal:

```bash
cd Homework2/milestone3
npm ci
node callback-client.js
```

You can replace `callback-client.js` with any of the other three client filenames. See [Milestone 3 README](Homework2/milestone3/README.md) for details.

## Homework 2 — Milestone 4

Milestone 4 is a browser-based client where users can join multiple rooms, send public or private messages, and see live membership counts and a combined message timeline. RxJS manages the reactive streams, and SSE delivers server updates without requiring a page refresh.

Milestone 4 has **its own Java server**, so the Homework 1 server is not needed to run it.

```bash
cd Homework2/milestone4
npm ci
bash start.sh
```

Open http://127.0.0.1:9000 in your browser.

See [Milestone 4 README](Homework2/milestone4/README.md) for the full feature list and implementation details.

> The Homework 1 SOAP server and the Milestone 4 server use port 9000 by default. Do not run them at the same time on that port.

## Notes

- The projects run locally.
- Accounts and messages stored in the Milestone 4 server's memory are reset when that server restarts.
- The AI-use disclosure for Homework 2 is in `Homework2/milestone4/AI-USAGE.md`.
