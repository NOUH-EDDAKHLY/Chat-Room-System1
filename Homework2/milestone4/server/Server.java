import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.SAXException;

public final class Server {
    private static final String SOAP = "http://schemas.xmlsoap.org/soap/envelope/";
    private static final String CHAT = "http://example.com/chatroom";
    private static final String COOKIE = "milestone4_session";
    private static final Map<String, List<String>> PARAMETERS = Map.ofEntries(
        Map.entry("register", List.of("username", "password")),
        Map.entry("login", List.of("username", "password")),
        Map.entry("createRoom", List.of("token", "name", "description")),
        Map.entry("listRooms", List.of("token")),
        Map.entry("joinRoom", List.of("token", "roomId")),
        Map.entry("listUsers", List.of("token", "roomId")),
        Map.entry("listMessages", List.of("token", "roomId")),
        Map.entry("broadcast", List.of("token", "roomId", "text")),
        Map.entry("privateMessage", List.of("token", "roomId", "recipient", "text")),
        Map.entry("leaveRoom", List.of("token", "roomId")),
        Map.entry("logout", List.of("token"))
    );

    private final ChatRoom chat = new ChatRoom();
    private final String wsdl;
    private final byte[] schema;

    private Server(int port) throws IOException {
        String address = "http://127.0.0.1:" + port;
        wsdl = Files.readString(Path.of("contract/ChatRoomService.wsdl"))
            .replace("REPLACE_WITH_ACTUAL_URL", address + "/chat-room")
            .replace("schemaLocation=\"ChatRoomService_schema1.xsd\"",
                "schemaLocation=\"" + address + "/ChatRoomService_schema1.xsd\"");
        schema = Files.readAllBytes(Path.of("contract/ChatRoomService_schema1.xsd"));
    }

    public static void main(String[] args) throws IOException {
        int port = args.length == 0 ? 9000 : Integer.parseInt(args[0]);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        port = server.getAddress().getPort();
        Server app = new Server(port);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/", app::handle);
        server.start();
        System.out.println("Chat Room website at http://127.0.0.1:" + port);
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            String path = exchange.getRequestURI().getPath();
            if (exchange.getRequestMethod().equals("GET")) {
                switch (path) {
                    case "/events" -> events(exchange);
                    case "/chat-room" -> {
                        if ("wsdl".equalsIgnoreCase(exchange.getRequestURI().getQuery())) {
                            reply(exchange, 200, "text/xml", wsdl);
                        } else reply(exchange, 404, "text/plain", "WSDL is at /chat-room?wsdl");
                    }
                    case "/ChatRoomService_schema1.xsd" -> reply(exchange, 200, "text/xml", schema);
                    case "/" -> file(exchange, "web/index.html", "text/html");
                    case "/styles.css" -> file(exchange, "web/styles.css", "text/css");
                    case "/app.js" -> file(exchange, "web/app.js", "text/javascript");
                    case "/streams.js" -> file(exchange, "web/streams.js", "text/javascript");
                    case "/rxjs.js" -> file(exchange, "node_modules/rxjs/dist/bundles/rxjs.umd.min.js", "text/javascript");
                    default -> reply(exchange, 404, "text/plain", "Not found");
                }
            } else if (path.equals("/chat-room") && exchange.getRequestMethod().equals("POST")) {
                soap(exchange);
            } else {
                reply(exchange, 405, "text/plain", "Method not allowed");
            }
        } finally {
            exchange.close();
        }
    }

    private void soap(HttpExchange exchange) throws IOException {
        String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
        if (contentType == null || !contentType.split(";", 2)[0].trim().equalsIgnoreCase("text/xml")) {
            reply(exchange, 415, "text/plain", "Expected SOAP 1.1 text/xml");
            return;
        }
        byte[] bytes = exchange.getRequestBody().readNBytes(65537);
        if (bytes.length > 65536) {
            reply(exchange, 413, "text/plain", "SOAP request is too large");
            return;
        }
        try {
            Element envelope = parse(bytes);
            if (!SOAP.equals(envelope.getNamespaceURI()) || !"Envelope".equals(envelope.getLocalName())) {
                throw new IllegalArgumentException("Expected SOAP 1.1 envelope.");
            }
            Element body = child(envelope, "Body", SOAP);
            Element request = body == null ? null : firstElement(body);
            String operation = request == null ? null : request.getLocalName();
            if (operation == null || !CHAT.equals(request.getNamespaceURI()) || !PARAMETERS.containsKey(operation)) {
                throw new IllegalArgumentException("Unknown SOAP operation.");
            }
            Map<String, String> args = new HashMap<>();
            for (String name : PARAMETERS.get(operation)) {
                Element field = child(request, name, null);
                if (field == null) field = child(request, name, CHAT);
                if (field != null) args.put(name, field.getTextContent());
            }
            ChatRoom.Result result = chat.call(operation, args);
            String response = property("message", result.message()) + property("success", String.valueOf(result.success()));
            if ("login".equals(operation)) {
                response += property("token", result.value());
                if (result.success()) {
                    String previous = cookie(exchange);
                    if (previous != null) chat.call("logout", Map.of("token", previous));
                    cookie(exchange, result.value());
                }
            } else if (!"register".equals(operation)) {
                response += property("value", result.value());
            }
            if ("logout".equals(operation) && result.success() && Objects.equals(args.get("token"), cookie(exchange))) {
                cookie(exchange, "");
            }
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            reply(exchange, 200, "text/xml", envelope("<c:" + operation + "Response xmlns:c=\"" + CHAT
                + "\"><return>" + response + "</return></c:" + operation + "Response>"));
        } catch (SAXException | ParserConfigurationException | IllegalArgumentException error) {
            reply(exchange, 500, "text/xml", envelope("<soap:Fault><faultcode>soap:Client</faultcode>"
                + property("faultstring", "Invalid SOAP request.") + "</soap:Fault>"));
        }
    }

    private void events(HttpExchange exchange) throws IOException {
        ChatRoom.Stream stream = chat.subscribe(cookie(exchange));
        if (stream == null) {
            reply(exchange, 401, "text/plain", "Login required");
            return;
        }
        try {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store");
            exchange.sendResponseHeaders(200, 0);
            OutputStream output = exchange.getResponseBody();
            while (!Thread.currentThread().isInterrupted()) {
                String event = stream.events.poll(15, TimeUnit.SECONDS);
                if (ChatRoom.Stream.END.equals(event)) break;
                output.write((event == null ? ": keepalive\n\n" : event).getBytes(StandardCharsets.UTF_8));
                output.flush();
                if (event != null && event.startsWith("event: signed-out\n")) break;
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (IOException disconnected) {
        } finally {
            chat.unsubscribe(stream);
        }
    }

    private static Element parse(byte[] bytes) throws ParserConfigurationException, IOException, SAXException {
        var factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        return factory.newDocumentBuilder().parse(new ByteArrayInputStream(bytes)).getDocumentElement();
    }

    private static Element child(Element parent, String name, String namespace) {
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (node instanceof Element element && name.equals(element.getLocalName())
                && Objects.equals(namespace, element.getNamespaceURI())) return element;
        }
        return null;
    }

    private static Element firstElement(Element parent) {
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (node instanceof Element element) return element;
        }
        return null;
    }

    private static String cookie(HttpExchange exchange) {
        for (String header : exchange.getRequestHeaders().getOrDefault("Cookie", List.of())) {
            for (String piece : header.split(";")) {
                String nameValue = piece.trim();
                if (nameValue.startsWith(COOKIE + "=")) return nameValue.substring(COOKIE.length() + 1);
            }
        }
        return null;
    }

    private static void cookie(HttpExchange exchange, String token) {
        exchange.getResponseHeaders().add("Set-Cookie", COOKIE + "=" + token
            + "; Path=/; HttpOnly; SameSite=Strict" + (token.isEmpty() ? "; Max-Age=0" : ""));
    }

    private static String property(String name, String value) {
        if (value == null) return "";
        return "<" + name + ">" + value.replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace("\r", "&#13;") + "</" + name + ">";
    }

    private static String envelope(String body) {
        return "<soap:Envelope xmlns:soap=\"" + SOAP + "\"><soap:Body>" + body + "</soap:Body></soap:Envelope>";
    }

    private static void file(HttpExchange exchange, String name, String mime) throws IOException {
        Path path = Path.of(name);
        if (Files.isRegularFile(path)) reply(exchange, 200, mime, Files.readAllBytes(path));
        else reply(exchange, 404, "text/plain", "Missing " + name + ". Run npm ci from the project directory.");
    }

    private static void reply(HttpExchange exchange, int code, String mime, String body) throws IOException {
        reply(exchange, code, mime, body.getBytes(StandardCharsets.UTF_8));
    }

    private static void reply(HttpExchange exchange, int code, String mime, byte[] body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", mime + "; charset=utf-8");
        exchange.sendResponseHeaders(code, body.length);
        exchange.getResponseBody().write(body);
    }
}
