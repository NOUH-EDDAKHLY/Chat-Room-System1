import java.time.Instant;
import java.util.*;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.stream.Collectors;

final class ChatRoom {
    record Result(boolean success, String message, String value) {}
    record Message(long id, Instant timestamp, String sender, String recipient, String text) {
        boolean visibleTo(String user) {
            return recipient == null || sender.equals(user) || recipient.equals(user);
        }

        String legacyText() {
            return recipient == null ? sender + ": " + text
                : "[private] " + sender + " -> " + recipient + ": " + text;
        }

        String json(String roomId) {
            return "{" + Json.field("id", Long.toString(id)) + "," + Json.field("roomId", roomId)
                + "," + Json.field("timestamp", timestamp.toString()) + ","
                + Json.field("sender", sender) + "," + Json.field("recipient", recipient)
                + "," + Json.field("text", text) + "}";
        }
    }

    private static final class Room {
        final String id = UUID.randomUUID().toString();
        final String name;
        final String description;
        final Set<String> members = new LinkedHashSet<>();
        final List<Message> messages = new ArrayList<>();

        Room(String name, String description) {
            this.name = name;
            this.description = description;
        }
    }

    static final class Stream {
        static final String END = "";
        final String token;
        final String user;
        final LinkedBlockingQueue<String> events = new LinkedBlockingQueue<>(256);

        Stream(String token, String user) {
            this.token = token;
            this.user = user;
        }

        boolean offer(String event, String json) {
            if (events.offer("event: " + event + "\ndata: " + json + "\n\n")) return true;
            close();
            return false;
        }

        void close() {
            events.clear();
            events.offer(END);
        }
    }

    private final Map<String, String> users = new HashMap<>();
    private final Map<String, String> sessions = new HashMap<>();
    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final List<Stream> streams = new ArrayList<>();
    private long lastMessageId;

    synchronized Result call(String operation, Map<String, String> args) {
        String username = args.get("username");
        String password = args.get("password");
        if (operation.equals("register") || operation.equals("login")) {
            return account(operation, username, password);
        }

        String token = args.get("token");
        String user = sessions.get(token);
        if (user == null) {
            return fail(operation.equals("logout") ? "Invalid or expired token." : "Authentication required.");
        }

        Room room = rooms.get(args.get("roomId"));
        return switch (operation) {
            case "createRoom" -> createRoom(args.get("name"), args.get("description"));
            case "listRooms" -> listRooms();
            case "joinRoom" -> {
                if (room == null) yield fail("Room not found.");
                if (room.members.add(user)) membershipChanged(room, user);
                yield ok("Joined room.", null);
            }
            case "listUsers" -> isMember(room, user)
                ? ok(String.join(", ", room.members), null) : fail("You must join the room first.");
            case "listMessages" -> {
                if (!isMember(room, user)) yield fail("You must join the room first.");
                String history = room.messages.stream().filter(message -> message.visibleTo(user))
                    .map(Message::legacyText).collect(Collectors.joining("\n"));
                yield ok(history.isEmpty() ? "No messages found." : history, null);
            }
            case "broadcast", "privateMessage" -> send(room, user, args.get("text"),
                args.get("recipient"), operation.equals("privateMessage"));
            case "leaveRoom" -> {
                if (!isMember(room, user)) yield fail("You are not a member of this room.");
                room.members.remove(user);
                membershipChanged(room, user);
                yield ok("Left room.", null);
            }
            case "logout" -> logout(token, user);
            default -> throw new IllegalArgumentException("Unknown SOAP operation.");
        };
    }

    private Result account(String operation, String username, String password) {
        if (blank(username) && blank(password)) return fail("Username and password cannot be empty or blank.");
        if (blank(username)) return fail("Username cannot be empty or blank.");
        if (blank(password)) return fail("Password cannot be empty or blank.");

        if (operation.equals("register")) {
            if (users.putIfAbsent(username, password) != null) return fail("Username is already registered.");
            return ok("Account created.", null);
        }

        if (!password.equals(users.get(username))) return fail("Invalid username or password.");
        String token = UUID.randomUUID().toString();
        sessions.put(token, username);
        return ok("Login successful.", token);
    }

    private Result createRoom(String name, String description) {
        if (blank(name) || blank(description)) return fail("Room name and description are required.");
        if (rooms.values().stream().anyMatch(room -> room.name.equals(name))) return fail("Room name must be unique.");
        Room room = new Room(name, description);
        rooms.put(room.id, room);
        String directory = directory();
        streams.removeIf(stream -> !stream.offer("directory", directory));
        return ok("Room created.", room.id);
    }

    private Result listRooms() {
        StringBuilder result = new StringBuilder();
        for (Room room : rooms.values()) {
            result.append(room.id).append(" | ").append(room.name).append(" | ")
                .append(room.description).append(" | members: ").append(room.members.size()).append('\n');
        }
        return ok(result.isEmpty() ? "No rooms found." : result.toString(), null);
    }

    private Result send(Room room, String sender, String text, String recipient, boolean isPrivate) {
        if (!isMember(room, sender)) return fail("You must join the room first.");
        if (isPrivate && (blank(recipient) || !room.members.contains(recipient))) {
            return fail("Recipient must be a user in the joined room.");
        }
        if (blank(text)) return fail("Message text is required.");
        Message message = new Message(++lastMessageId, Instant.now(), sender, isPrivate ? recipient : null, text);
        room.messages.add(message);
        String event = message.json(room.id);
        streams.removeIf(stream -> isMember(room, stream.user) && message.visibleTo(stream.user)
            && !stream.offer("chat", event));
        return ok(isPrivate ? "Private message sent." : "Message broadcast.", null);
    }

    private Result logout(String token, String user) {
        sessions.remove(token);
        streams.removeIf(stream -> {
            if (!stream.token.equals(token)) return false;
            stream.offer("signed-out", "{}");
            return true;
        });
        if (!sessions.containsValue(user)) {
            for (Room room : rooms.values()) {
                if (room.members.remove(user)) membershipChanged(room, user);
            }
        }
        return ok("Logged out.", null);
    }

    synchronized Stream subscribe(String token) {
        String user = sessions.get(token);
        if (user == null) return null;
        Stream stream = new Stream(token, user);
        stream.offer("snapshot", snapshot(user));
        streams.add(stream);
        return stream;
    }

    synchronized void unsubscribe(Stream stream) {
        streams.remove(stream);
    }

    private void membershipChanged(Room room, String user) {
        String snapshot = snapshot(user);
        String count = "{" + Json.field("roomId", room.id) + ",\"count\":" + room.members.size() + "}";
        streams.removeIf(stream -> {
            if (stream.user.equals(user)) return !stream.offer("snapshot", snapshot);
            return isMember(room, stream.user) && !stream.offer("count", count);
        });
    }

    private String snapshot(String user) {
        String joined = rooms.values().stream().filter(room -> isMember(room, user))
            .map(room -> "{\"id\":" + Json.string(room.id) + ",\"count\":" + room.members.size()
                + ",\"messages\":" + room.messages.stream().filter(message -> message.visibleTo(user))
                    .map(message -> message.json(room.id)).collect(Collectors.joining(",", "[", "]")) + "}")
            .collect(Collectors.joining(",", "[", "]"));
        return "{" + Json.field("username", user) + ",\"directory\":" + directory() + ",\"rooms\":" + joined + "}";
    }

    private String directory() {
        return rooms.values().stream()
            .map(room -> "{" + Json.field("id", room.id) + "," + Json.field("name", room.name)
                + "," + Json.field("description", room.description) + "}")
            .collect(Collectors.joining(",", "[", "]"));
    }

    private static boolean isMember(Room room, String user) {
        return room != null && room.members.contains(user);
    }
    private static boolean blank(String text) {
        return text == null || text.isBlank();
    }
    private static Result ok(String message, String value) {
        return new Result(true, message, value);
    }
    private static Result fail(String message) {
        return new Result(false, message, null);
    }
}
