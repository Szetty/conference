import "phoenix"
import socket from "./socket"
import Conference from "./conference"

let channel = socket.channel("conference", {});
channel.join()
    .receive("ok", () => {
        console.log("Successfully joined call channel");
        new Conference(channel);
    })
    .receive("error", () => { console.log("Unable to join") });