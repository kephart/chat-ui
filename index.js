// Modules
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const cors = require('cors');
const WebSocketServer = require('ws').Server;
const router = express.Router();
const path = require('path');

// JSON files
const output_json = require('./data/output-gate-json.json');
const endpoints = require('./data/endpoints.json');
const sampleRound = require('./data/sample-round.json');

// initialize API and start listening for requests
var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/', router);
app.use(express.static(__dirname));
app.use(express.static(__dirname + '/styles/stylesheet.css'));
app.use(express.static(__dirname + '/scripts/functions.js'));
app.listen(process.env.port || 2500);
console.log("Express server listening on port 2500");

// Initialize the websocket server
var sock = new WebSocketServer({ port: 2501 });

/*
Description: Reply to the user with the agents response.
Input: string - agent response JSON
Output: none.
Effects: send json object containing sender and message through websocket
         to the browser.
*/
sock.broadcast = function broadcast(data) {

  // sends the message to all users
  sock.clients.forEach(function each(client) {
    if(client.readyState === 1 ) {

      // send the message/sender to the client
      client.send(JSON.stringify(data));
    }
  });
};


// Manage the connection of a new client
sock.on('connection', function connection(client) {
  console.log("CONNECTION OK...");

  // if the client sends a message, or if the round button was clicked
  client.on('message', function incoming(data) {

    // If the start button was clicked
    if(data === "START_NEW_ROUND") {

      // gather all utility data
      var new_round = sampleRound;
      var celia_data, watson_data, human_data;

      var message = {roundTotal: true, newRound: true};
      sock.broadcast(message);

      request.get(endpoints.anac_utility + "/generateUtility/agent", (error, res, body) => {

        celia_data = JSON.parse(body);

        // Set Celia's round information
        new_round.agents[0].utilityFunction = celia_data;
        new_round.agents[0].protocol = endpoints.celia.protocol;
        new_round.agents[0].host = endpoints.celia.host;
        new_round.agents[0].port = endpoints.celia.port;

        // Get the agent utility data from the utility generator
        request.get(endpoints.anac_utility + "/generateUtility/agent", (error, res, body) => {
          
          // Parse the string data into a JSON object
          watson_data = JSON.parse(body);

          // Set Watson's round information
          new_round.agents[1].utilityFunction = watson_data;
          new_round.agents[1].protocol = endpoints.watson.protocol;
          new_round.agents[1].host = endpoints.watson.host;
          new_round.agents[1].port = endpoints.watson.port;

          // Get the human utility data
          request.get(endpoints.anac_utility + "/generateUtility/human", (error, res, body) => {
            
            // Parse the string data into a JSON object
            human_data = JSON.parse(body);

            // Set the Human's round information
            new_round.human.utilityFunction = human_data;

            // send /startRound request with new json
            request.post(endpoints.env_orch + "/startRound", {

              // formatted JSON object
              json: new_round
            
            // Error handler for POST request
            }, (error, res) => {
              if (error) {
                console.error(error);
                return;
              }
              console.log(`statusCode: ${res.statusCode}`);
            });
          });
        });
      });
    
    // If just a message to the agents, follow here
    } else {

      // gather format for new message
      var message = output_json;

      // try and set the agents name, if given
      const lower_transcript = data.toLowerCase();
      if (lower_transcript.startsWith('watson') || lower_transcript.startsWith('@watson')) {
        message.addressee = 'Watson';
      }
      else if (lower_transcript.startsWith('celia') || lower_transcript.startsWith('@celia')) {
        message.addressee = 'Celia';
      }
      else {
        message.addressee = '';
      }

      // set all other json data
      message.speaker = "Human";
      message.text = data;
      message.timestamp = Date.now();

      // HTTP post request to send user message.
      request.post(endpoints.env_orch + endpoints.output, {

        // formatted JSON object
        json: message
      
      // Error handler for POST request
      }, (error, res) => {
        if (error) {
          console.error(error);
          return;
        }
        console.log(`statusCode: ${res.statusCode}`);
      });
    }
  });
});


// Display index.html on http://localhost:2500/
app.get('/', function(req, res){
  res.sendFile(path.join(__dirname, 'index.html'));
});


/*
Description: Send the agent response to be displayed.
Input: JSON - example found in README.
Output: JSON - {“msgType” = “submitTranscript”,“Status” = “OK”}, sent to sender
Effects: display agent message to user
*/
app.post(endpoints.input, function(req, res) {
  var json_content = req.body;

  if(json_content.speaker === "Human") {
    var json = {msgType: 'submitTranscript', Status: 'OK'};
    res.send(json);
    return;
  }

  // Send to broadcast method for displaying in UI
  sock.broadcast(json_content);
  
  // send 'ack'
  var json = {msgType: 'submitTranscript', Status: 'OK'};
  res.send(json);
});


/*
Description: Display results of the round.
Input: JSON object
Output: JSON - {“msgType” = “submitTranscript”,“Status” = “OK”}, sent to sender
Effects: display round results to user
*/
app.post("/receiveRoundTotals", function(req, res) {

  console.log("received round total");
  console.log(req.body);

  // collect and organize JSON data into separate variables
  var json_content = req.body;

  // Grab celias utility
  var celiaUtility = json_content.roundTotals.Celia;
  var message = {roundTotal: true, newRound: false, id: "Celia", data: celiaUtility};
  sock.broadcast(message);

  // Grab watsons utility
  var watsonUtility = json_content.roundTotals.Watson;
  var message = {roundTotal: true, newRound: false, id: "Watson", data: watsonUtility};
  sock.broadcast(message);

  // Grab the human utility
  var humanUtility = json_content.roundTotals.Human;
  var message = {roundTotal: true, newRound: false, id: "Human", data: humanUtility};
  sock.broadcast(message);

  var json = {Status: 'OK'};
  res.send(json);
});


// Dummy endpoints for E.O.
app.post('/receiveRejection', function(req, res) {
  var json = {status: 'Acknowledged'};
  res.send(json);
});
app.post('/startRound', function(req, res) {
  var json = {status: 'Acknowledged'};
  res.send(json);
});
app.post('/endRound', function(req, res) {
  var json = {status: 'Acknowledged'};
  res.send(json);
});


// Psuedo routing api for communication between user and agents
var dummyRoute = express();
dummyRoute.use(cors());
dummyRoute.use(bodyParser.json());
dummyRoute.listen(3500);


// Redirect user/agent messages through dummyRoute and toward destination
dummyRoute.post(endpoints.output, function(req, res) {
  var json_content = req.body;

  // message from user to agents
  if(json_content.speaker === "Human") {
    request.post(endpoints.agent_message + endpoints.input, {

      // formatted JSON object
      json: json_content
    
    // Error handler for POST request
    }, (error, res) => {
      if (error) {
        console.error(error);
        return;
      }
      console.log(`statusCode: ${res.statusCode}`);
    });

  // message from agent to user
  } else {
    request.post(endpoints.chatUI_server + endpoints.input, {

      // formatted JSON object
      json: json_content
    
    // Error handler for POST request
    }, (error, res) => {
      if (error) {
        console.error(error);
        return;
      }
      console.log(`statusCode: ${res.statusCode}`);
    });
  }

  // send acknowledgment
  var json = {Status: 'OK'};
  res.send(json);
});
