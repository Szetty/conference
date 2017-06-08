defmodule Conference.ConferenceChannel do
  use Phoenix.Channel

  def join("conference", _auth_msg, socket) do
    {:ok, socket}
  end

  def handle_in("ready", %{"id" => id}, socket) do
    #:ok = ChannelWatcher.monitor(:rooms, self(), {__MODULE__, :leave, id})
    broadcast! socket, "joined", %{"participant": id}
    {:reply, {:ready, %{"participants" => Participants.get_all_but(id)}}, socket}
  end

  def handle_in("message", %{"body" => body, "from" => id, "to" => to}, socket) do
    broadcast! socket, "message", %{body: body, id: id, to: to}
    {:noreply, socket}
  end

  def handle_in("leaving", %{"id" => id}, socket) do
    broadcast! socket, "left", %{id: id}
    {:noreply, socket}
  end

  def leave(id) do
    IO.puts("User with id #{id} left")
    Participants.remove(id)
  end

end