const {classifyMessage} = require('./conversation.js');
const {setLogLevel, logExpression} = require('@cisl/zepto-logger');

let logLevel = 1;
setLogLevel(logLevel);

// From the intents and entities obtained from Watson Assistant, extract a structured representation
// of the message
function interpretMessage(watsonResponse) {
  logExpression("In interpretMessage, watsonResponse is: ", 2);
  logExpression(watsonResponse, 2);
  let intents = watsonResponse.intents;
  let entities = watsonResponse.entities;
  let cmd = {};
  if (intents[0].intent == "Offer" && intents[0].confidence > 0.2) {
    let extractedOffer = extractOfferFromEntities(entities);
    cmd = {
      quantity: extractedOffer.quantity
    };
    if(extractedOffer.price) {
      cmd.price = extractedOffer.price;
      if(watsonResponse.input.role == "buyer") {
        cmd.type = "BuyOffer";
      }
      else if (watsonResponse.input.role == "seller") {
        cmd.type = "SellOffer";
      }
    }
    else {
      if(watsonResponse.input.role == "buyer") {
        cmd.type = "BuyRequest";
      }
      else if (watsonResponse.input.role == "seller") {
        cmd.type = "SellRequest";
      }
    }
  }
  else if (intents[0].intent == "AcceptOffer" && intents[0].confidence > 0.2) {
    cmd = {
      type: "AcceptOffer"
    };
  }
  else if (intents[0].intent == "RejectOffer" && intents[0].confidence > 0.2) {
    cmd = {
      type: "RejectOffer"
    };
  }
  else {
    cmd = null;
  }
  if(cmd) {
    cmd.metadata = watsonResponse.input;
    cmd.metadata.addressee = watsonResponse.input.addressee || extractAddressee(entities); // Expect the addressee to be provided, but extract it if necessary
    cmd.metadata.timeStamp = new Date();
  }
  return cmd;
}

// Extract the addressee from entities (in case addressee is not already supplied with the input message)
function extractAddressee(entities) {
  let addressees = [];
  let addressee = null;
  entities.forEach(eBlock => {
    if(eBlock.entity == "avatarName") {
      addressees.push(eBlock.value);
    }
  });
  logExpression("Found addressees: ", 2);
  logExpression(addressees, 2);
  if(addressees.includes(agentName)) addressee = agentName;
  else addressee = addressees[0];
  return addressee;
}

// Extract goods and their amounts from the entities extracted by Watson Assistant
function extractOfferFromEntities(entityList) {
  let entities = JSON.parse(JSON.stringify(entityList));
  let removedIndices = [];
  let quantity = {};
  let state = null;
  let amount = null;
  entities.forEach((eBlock,i) => {
    entities[i].index = i;
    if(eBlock.entity == "sys-number") {
      amount = parseFloat(eBlock.value);
      state = 'amount';
    }
    else if (eBlock.entity == "good" && state == 'amount') {
      quantity[eBlock.value] = amount;
      state = null;
      removedIndices.push(i-1);
      removedIndices.push(i);
    }
  });
  entities = entities.filter(eBlock => {
    return !(removedIndices.includes(eBlock.index));
  });
  let price = extractPrice(entities);
  return {
    quantity,
    price
  };
}

// Extract price from entities extracted by Watson Assistant
function extractPrice(entities) {
  let price = null;
  entities.forEach(eBlock => {
    if(eBlock.entity == "sys-currency") {
      price = {
        value: eBlock.metadata.numeric_value,
        unit: eBlock.metadata.unit
      };
    }
    else if(eBlock.entity == "sys-number" && !price) {
      price = {
        value: eBlock.metadata.numeric_value,
        unit: "USD"
      };
    }
  });
  return price;
}

function extractBidFromMessage(message) {
  logExpression("In processOffer, message is: ", 2);
  logExpression(message, 2);
  return classifyMessage(message)
  .then(response => {
    response.environmentUUID = message.environmentUUIID;
    logExpression("Response from classify message: ", 2);
    logExpression(response, 2);
    return interpretMessage(response);
  })
  .then(receivedOffer => {
    let extractedBid = {
      type: receivedOffer.type,
      price: receivedOffer.price,
      quantity: receivedOffer.quantity
    };
    return extractedBid;
  });
}


exports = module.exports = {
  interpretMessage,
  extractBidFromMessage
};
