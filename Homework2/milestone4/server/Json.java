final class Json {
    private Json() {}

    static String field(String name, String value) {
        return string(name) + ":" + string(value);
    }

    static String string(String value) {
        if (value == null) return "null";
        StringBuilder output = new StringBuilder("\"");
        for (char character : value.toCharArray()) {
            switch (character) {
                case '"' -> output.append("\\\"");
                case '\\' -> output.append("\\\\");
                default -> {
                    if (character < 0x20) output.append(String.format("\\u%04x", (int) character));
                    else output.append(character);
                }
            }
        }
        return output.append('"').toString();
    }
}
