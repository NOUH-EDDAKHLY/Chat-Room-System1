const { BehaviorSubject, ReplaySubject, combineLatest, merge, of, map, scan, startWith,
    switchMap, distinctUntilChanged, auditTime } = globalThis.rxjs;

export function createChatStreams() {
    const joinedRooms$ = new BehaviorSubject(new Map());

    const counts$ = joinedRooms$.pipe(switchMap(rooms => {
        const counts = Array.from(rooms, ([id, room]) => room.count$.pipe(map(count => ({ id, count }))));
        return counts.length ? combineLatest(counts) : of([]);
    }));
    const total$ = counts$.pipe(
        map(counts => counts.reduce((total, room) => total + room.count, 0)),
        distinctUntilChanged()
    );

    const messages$ = joinedRooms$.pipe(switchMap(rooms => {
        if (!rooms.size) return of([]);
        return merge(...Array.from(rooms.values(), room => room.messages$)).pipe(
            scan((byId, message) => byId.set(message.id, message), new Map()),
            auditTime(0),
            map(byId => [...byId.values()].sort((a, b) => {
                const left = BigInt(a.id);
                const right = BigInt(b.id);
                return left < right ? -1 : left > right ? 1 : 0;
            })),
            startWith([])
        );
    }));

    function setRooms(rooms) {
        const previous = joinedRooms$.value;
        const next = new Map();
        for (const snapshot of rooms) {
            const room = { count$: new BehaviorSubject(snapshot.count), messages$: new ReplaySubject() };
            for (const message of snapshot.messages) room.messages$.next(message);
            next.set(snapshot.id, room);
        }
        joinedRooms$.next(next);
        for (const room of previous.values()) {
            room.count$.complete();
            room.messages$.complete();
        }
    }

    return {
        joinedRooms$, counts$, total$, messages$, setRooms,
        updateCount({ roomId, count }) {
            joinedRooms$.value.get(roomId)?.count$.next(count);
        },
        addMessage(message) {
            joinedRooms$.value.get(message.roomId)?.messages$.next(message);
        }
    };
}
