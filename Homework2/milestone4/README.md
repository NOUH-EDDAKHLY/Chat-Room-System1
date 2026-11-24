# Homework 2 — Milestone 4

## Overview

This project is a browser-based chat application built with HTML, CSS, JavaScript, and RxJS. A Java server processes SOAP requests and uses Server-Sent Events (SSE) to deliver live updates to connected browsers.

Users can create accounts, log in, create rooms, join and leave multiple rooms, and send public or private messages. The website automatically updates room membership counts and displays messages from joined rooms in a single timeline.

## Requirements

- JDK 17 or newer
- Node.js 20 or newer with npm
- Bash

## Running the application

Open a terminal in the `milestone4` directory and run:

```bash
npm ci
bash start.sh
```

Open **http://127.0.0.1:9000** in your browser.

If port 9000 is already in use, start the server on another port:

```bash
bash start.sh 9001
```

Then open **http://127.0.0.1:9001**.

To stop the server, press **Ctrl+C** in the terminal.

## Main features

- **Accounts:** Register, log in, and log out.
- **Room management:** Create rooms, view available rooms, and join or leave rooms independently.
- **Concurrent joining:** Select multiple rooms and join them without waiting for each request to finish before starting the next.
- **Live membership totals:** See the number of members in each joined room and the combined membership total.
- **Public messaging:** Send messages to all members of a selected room.
- **Private messaging:** Send messages visible only to the sender and the specified recipient, provided they belong to the same room.
- **Unified timeline:** View messages from multiple joined rooms together, ordered by server-assigned message IDs.
- **Live updates:** Receive membership and message changes automatically without refreshing the page.

## Reactive programming implementation

| Requirement | Implementation |
| --- | --- |
| Join multiple rooms concurrently | RxJS `mergeMap` processes room-join requests concurrently. |
| Maintain dynamically joined rooms | A `BehaviorSubject` stores the current set of joined rooms and changes when a user joins or leaves. |
| Recalculate counts when rooms change | `switchMap` switches to the current room streams, while `combineLatest` gathers their latest membership counts. |
| Calculate the total number of memberships | `map` adds the counts of all joined rooms. If no rooms are joined, the total is zero. |
| Combine messages from different rooms | `merge` combines the room message streams into one timeline. Messages are deduplicated and sorted by their server-assigned IDs. |
| Push live changes to the browser | An SSE connection through `EventSource` receives room, count, and message updates from the Java server. |

## Communication between the browser and server

The browser sends commands to the Java server using SOAP. These commands include registration, login, room creation, joining, leaving, and messaging.

The Java server publishes relevant updates over SSE. After login, the browser opens an authenticated SSE connection and receives an initial snapshot of the user's rooms and messages. Later changes are delivered over the same connection.

SOAP is used for user actions, while SSE is used for continuous server-to-browser updates. The Java server keeps accounts, rooms, and message history in memory, so this data resets whenever the server restarts.

## Example demonstration

1. Open the website in a regular browser window and a private window.
2. Register and log in as a different user in each window.
3. Create two rooms, for example **General** and **Study**.
4. Join both rooms in the first window. The combined membership total should be **2**.
5. Join **General** in the second window. The first window's combined total should automatically change to **3**.
6. Send messages to the two rooms and observe them in one timeline.
7. Send a private message between the two users while they are both members of General. Verify that the message is visible only to the sender and recipient.
8. Leave General in the first window. The combined membership total should decrease from 3 to 1, and messages from General should disappear from that user's timeline.

## Project structure

| Path | Purpose |
| --- | --- |
| `server/ChatRoom.java` | Chat operations, room state, message handling, and event publication |
| `server/Server.java` | HTTP server, SOAP endpoint, static website, and SSE endpoint |
| `server/Json.java` | JSON serialization helper for SSE payloads |
| `contract/` | SOAP WSDL and XSD contract files |
| `web/index.html` | Website structure |
| `web/styles.css` | Website styling |
| `web/app.js` | User actions, SOAP calls, and SSE connection |
| `web/streams.js` | RxJS room streams, membership totals, and message timeline |
| `package.json`, `package-lock.json` | JavaScript dependencies |
| `start.sh` | Compiles and starts the Java server |

## References

- [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [RxJS — combineLatest](https://rxjs.dev/api/index/function/combineLatest)
- [RxJS — mergeMap](https://rxjs.dev/api/operators/mergeMap)
- [RxJS — switchMap](https://rxjs.dev/api/operators/switchMap)
- [RxJS — merge](https://rxjs.dev/api/index/function/merge)
