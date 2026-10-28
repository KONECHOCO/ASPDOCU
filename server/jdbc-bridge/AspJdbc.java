import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.Properties;

public class AspJdbc {
  public static void main(String[] args) {
    if (args.length > 0 && "ping".equals(args[0])) {
      System.out.println("{\"ok\":true,\"pong\":true}");
      return;
    }
    try {
      InputStream in = System.in;
      String host = readBlock(in);
      String user = readBlock(in);
      String password = readBlock(in);
      String port = readBlock(in);
      String library = readBlock(in);
      String naming = readBlock(in);
      int maxRows = Integer.parseInt(readLine(in).trim());
      int paramCount = Integer.parseInt(readLine(in).trim());
      ArrayList<String> params = new ArrayList<String>();
      for (int i = 0; i < paramCount; i++) params.add(readBlock(in));
      String sql = readBlock(in);
      String head = sql.trim().toUpperCase();
      if (!(head.startsWith("SELECT") || head.startsWith("WITH") || head.startsWith("VALUES"))) {
        fail("Sono ammesse solo letture: SELECT, WITH o VALUES.");
        return;
      }
      if (sql.indexOf(';') >= 0) {
        fail("Una sola istruzione SQL, senza punto e virgola.");
        return;
      }
      Class.forName("com.ibm.as400.access.AS400JDBCDriver");
      Properties info = new Properties();
      info.setProperty("user", user);
      info.setProperty("password", password);
      info.setProperty("prompt", "false");
      info.setProperty("naming", "system".equalsIgnoreCase(naming) ? "system" : "sql");
      info.setProperty("errors", "full");
      info.setProperty("login timeout", "15");
      info.setProperty("transaction isolation", "read uncommitted");
      info.setProperty("date format", "dmy");
      info.setProperty("date separator", "/");
      if (port != null && port.trim().length() > 0 && !port.trim().matches("\\d{1,5}")) {
        fail("Porta non valida.");
        return;
      }
      if (library != null && library.trim().length() > 0) info.setProperty("libraries", library.trim());
      String url = "jdbc:as400://" + host;
      Connection connection = DriverManager.getConnection(url, info);
      try {
        PreparedStatement statement = connection.prepareStatement(sql);
        try {
          if (maxRows > 0) statement.setMaxRows(maxRows);
          statement.setQueryTimeout(20);
          for (int i = 0; i < params.size(); i++) {
            String value = params.get(i);
            if (value == null) statement.setNull(i + 1, Types.VARCHAR);
            else statement.setString(i + 1, value);
          }
          ResultSet rows = statement.executeQuery();
          try {
            System.out.println(toJson(rows));
          } finally {
            rows.close();
          }
        } finally {
          statement.close();
        }
      } finally {
        connection.close();
      }
    } catch (SQLException error) {
      fail(error.getMessage());
    } catch (Exception error) {
      fail(error.getMessage() == null ? error.toString() : error.getMessage());
    }
  }

  static String toJson(ResultSet rows) throws SQLException {
    ResultSetMetaData meta = rows.getMetaData();
    int columns = meta.getColumnCount();
    StringBuilder out = new StringBuilder();
    out.append("{\"ok\":true,\"columns\":[");
    for (int i = 1; i <= columns; i++) {
      if (i > 1) out.append(',');
      out.append(jsonString(meta.getColumnLabel(i)));
    }
    out.append("],\"rows\":[");
    boolean first = true;
    while (rows.next()) {
      if (!first) out.append(',');
      first = false;
      out.append('{');
      for (int i = 1; i <= columns; i++) {
        if (i > 1) out.append(',');
        out.append(jsonString(meta.getColumnLabel(i)));
        out.append(':');
        String value = rows.getString(i);
        if (rows.wasNull() || value == null) out.append("null");
        else out.append(jsonString(value.trim()));
      }
      out.append('}');
    }
    out.append("]}");
    return out.toString();
  }

  static void fail(String message) {
    System.out.println("{\"ok\":false,\"error\":" + jsonString(message == null ? "Errore IBM i" : message) + "}");
    System.exit(1);
  }

  static String jsonString(String value) {
    StringBuilder out = new StringBuilder(value.length() + 8);
    out.append('"');
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      switch (c) {
        case '"': out.append("\\\""); break;
        case '\\': out.append("\\\\"); break;
        case '\n': out.append("\\n"); break;
        case '\r': out.append("\\r"); break;
        case '\t': out.append("\\t"); break;
        default:
          if (c < 32) out.append(String.format("\\u%04x", Integer.valueOf(c)));
          else out.append(c);
      }
    }
    out.append('"');
    return out.toString();
  }

  static String readLine(InputStream in) throws IOException {
    ByteArrayOutputStream line = new ByteArrayOutputStream();
    int b;
    while ((b = in.read()) != -1 && b != '\n') {
      if (b != '\r') line.write(b);
    }
    return new String(line.toByteArray(), "UTF-8");
  }

  static String readBlock(InputStream in) throws IOException {
    int length = Integer.parseInt(readLine(in).trim());
    byte[] body = new byte[length];
    int offset = 0;
    while (offset < length) {
      int read = in.read(body, offset, length - offset);
      if (read < 0) break;
      offset += read;
    }
    return new String(body, 0, offset, "UTF-8");
  }
}
