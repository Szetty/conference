defmodule Participants do

  @name :participants

  def start_link do
    {:ok, pid} = Agent.start_link(fn -> [] end)
    Process.register(pid, @name)
    :ok
  end

  def put(participant) do
    Agent.update(@name, fn participants ->
        if(Enum.member?(participants, participant)) do
            participants
        else
            [participant | participants]
        end
    end)
  end

  def get_all_but(participant) do
    Agent.get(@name, &Enum.filter(&1, fn p -> p != participant end))
  end

  def member?(participant) do
    Agent.get(@name, &Enum.member?(&1, participant))
  end

  def remove(participant) do
    Agent.update(@name, &Enum.filter(&1, fn p -> p != participant end))
  end

end