defmodule Conference.ConferenceController do
  use Conference.Web, :controller

  def index(conn, _params) do
    id = get_or_create_id(conn)
    conn = write_id(conn, id)
    render conn, "index.html"
  end

  defp get_or_create_id(conn) do
    cookies = conn.cookies
    id = Map.get(cookies, "id")
    if(!id || !Participants.member?(id)) do
        id = to_string(:os.system_time(:micro_seconds))
        Participants.put(id)
        id
    else
        id
    end
  end

  defp write_id(conn, id)do
    Plug.Conn.put_resp_cookie(conn, "id", id, [max_age: 3600, http_only: false])
  end
  
end