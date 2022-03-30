module.exports = function(RED) {
	const ws = require("ws");
	const inspect = require("util").inspect;
    function websockNode(config) {
		RED.nodes.createNode(this,config);
		this.wssServer = null;
        var node = this;
		node.on('close', ()=> {
			if (node.wssServer) node.wssServer.close();
			node.warn("Closing server ");
		});
        node.on('input', (msg) => {
			if (msg.payload == "connect" || msg.payload == "disconnect") {
				node.sTopic = msg.topic;
				if ( msg.payload == "connect" && (!msg.url) ) {
					node.error("[websock] connect must supply msg.url ");
					node.status({fill: "red", shape: "ring", text: "Msg.url not valid"});
					return null;
				} else if (msg.payload == "disconnect") {
					if (node.wssServer) {
						node.wssServer.close();
						node.status({fill: "blue", shape: "ring", text: "disconnecting "});
					} else {
						node.status({fill: "yellow", shape: "ring", text: "Disconnected "});
					}
					return null;
				}
				if ( (node.sURL) && (node.sURL != msg.url) ) {
					node.wssServer.close();
				}
				node.sURL = msg.url;
				node.wssServer = new ws.WebSocket(msg.url);
				node.status({fill: "blue", shape: "ring", text: "connecting to " + msg.url})
				node.wssServer.on("open", () => {
					node.status({fill: "green", shape: "dot", text: "connected:" + node.sURL});
				});
				node.wssServer.on("message", data => {
					let tdata = null;
					try {
						tdata = JSON.parse(data);
					} catch (err) {
						tdata = data + "";
						node.warn(["mesg NOT parsed " + err,err, tdata,data,msg]);
					}
					node.send({topic: node.sTopic, url: node.sURL, payload: tdata});
				});
				node.wssServer.on("error", data => {
					node.status({fill: "red", shape: "ring", text: "Error " + data});
					
				});
				node.wssServer.on("close", () => {
					node.status({fill: "yellow", shape: "ring", text: "closed"});
				});
			} else {
				node.error("[websock] Payload must be connect|disconnect it is " + msg.payload);
				node.status({fill: "red", shape: "ring", text: "Unknown payload " + msg.payload});
				return null;
			}
        });
    }
    RED.nodes.registerType("websock",websockNode);
	function multiWebSockNode(config) {
		RED.nodes.createNode(this,config);
		this.wssServers = {};
        var node = this;
		node.on('close', ()=> {
			node.warn("[MultiWebSockNode][info] Closing " + Object.values(node.wssServers).length + " Servers");
			Object.keys(node.wssServers).forEach( (wss) => node.wssServers[wss].server.close(() => node.wssServers[wss] = {}) );
		});
        node.on('input', (msg) => {
			if (msg.payload == "connect" || msg.payload == "disconnect" || msg.payload == "clear" || msg.payload == "status") {
				if ( msg.payload != "clear" && msg.payload != "status" && (!msg.url) ) {
					node.error("[websock] connect or disconnect must supply msg.url ");
					node.status({fill: "red", shape: "ring", text: "Msg.url not valid"});
					return null;
				}
				if (msg.payload == "status") {
					node.warn("MultiWebSockNode][info][status] " + Object.values(node.wssServers).length + " Servers");
					Object.keys(node.wssServers).forEach( (wss) => {
						node.warn("MultiWebSockNode][info][status] " + wss + " " + node.wssServers[wss].topic);
					});
					return null;
				}
				if (msg.payload == "clear") {
					node.warn("[MultiWebSockNode][info][clear] Clearing " + Object.values(node.wssServers).length + " Servers");
					Object.keys(node.wssServers).forEach( (wss) => {
						node.warn("[MultiWebSockNode][info][clear] Closing " + node.wssServers[wss].url);
						node.wssServers[wss].server.close(() => node.wssServers[wss] = {}) 
					});
					node.status({fill: "yellow", shape: "ring", text: "Cleared " + msg.url})
					return null;
				}
				if (msg.payload == "disconnect") {
					if (!node.wssServers[msg.url]) {
						node.warn("[MultiWebSockNode][info][disconnect] Server " + msg.url + " Not opened ");
						return null;
					}
					if (!node.wssServers[msg.url].server) {
						node.warn("[MultiWebSockNode][debug][disconnect] Closing Server " + msg.url);
						node.wssServers[msg.url].server.close();
						node.status({fill: "blue", shape: "ring", text: "disconnecting "});
					} else {
						node.warn("[MultiWebSockNode][debug][disconnect]  Server already closed " + msg.url);
						node.status({fill: "yellow", shape: "ring", text: "Disconnected "});
					}
					node.wssServers[msg.url] = null;
					return null;
				}
				if (node.wssServers[msg.url]) {
					node.warn("[MultiWebSockNode][info] Server " + msg.url + " already connected will close and reconnect");
					node.wssServers[msg.url].close((err) => {
						if (err) node.warn("[MultiWebSockNode][info] Error Closing Server " + msg.url + " " + JSON.stringify(err));
						node.warn("[MultiWebSockNode][debug][connect]  Re Opening " + msg.url);
						node.wssServers[msg.url] = new ws.WebSocket(msg.url);
					});
				} else {
					node.wssServers[msg.url] = {};
					node.warn("[MultiWebSockNode][debug][connect]  Opening " + msg.url);
					node.wssServers[msg.url].server = new ws.WebSocket(msg.url);
				}
				node.wssServers[msg.url].topic = msg.topic;
				node.wssServers[msg.url].url = msg.url;
				node.wssServers[msg.url].onMessage = function(url, data) {
						let tdata = null;
						try {
							tdata = JSON.parse(data);
						} catch (err) {
							tdata = data + "";
							node.warn(["mesg NOT parsed " + err, err, tdata, data,msg]);
						}
						node.send({topic: node.wssServers[url].topic, url: node.wssServers[url].url, payload: tdata});
					};
				node.wssServers[msg.url].onClose = function(url, ev) {
						node.send({topic: node.wssServers[url].topic + "/close", url: node.wssServers[url].url, payload: ev});
					};
				node.status({fill: "blue", shape: "ring", text: "connecting to " + msg.url})
				node.wssServers[msg.url].server.on("open", () => {
					node.status({fill: "green", shape: "dot", text: "connected:" + msg.url});
				});
				node.wssServers[msg.url].server.on("error", data => {
					node.status({fill: "red", shape: "ring", text: "error:" + msg.url + " " + data});
					
				});
				node.wssServers[msg.url].server.on("close", (ev) => {
					node.status({fill: "yellow", shape: "ring", text: "closed:"  + msg.url + " " + ev.reason});
					node.wssServers[msg.url].onClose(msg.url, ev);
				});
				node.wssServers[msg.url].server.on("message", data => {
					node.wssServers[msg.url].onMessage(msg.url, data);
				});
				return null;
			} else {
				node.error("[websock] Payload must be connect|disconnect||clear was  " + msg.payload);
				node.status({fill: "red", shape: "ring", text: "Unknown payload " + msg.payload});
				return null;
			}
        });
    }
    RED.nodes.registerType("multiwebsock",multiWebSockNode);
}