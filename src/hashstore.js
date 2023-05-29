// *hashstore.js가 hashFromOriginalFile이 담긴 토픽을 구독하여 해시 hashFromOriginalFile을 얻는다. 
// subscriber.js가 '해시 h1을 달라고 요구하는' 토픽을 구독하고 해시 h1을 index.js로 보낸다. 

const { Client, TopicMessageQuery, TopicCreateTransaction, TopicMessageSubmitTransaction } = require('@hashgraph/sdk');
require("dotenv").config();
const readline = require('readline');
const fs = require('fs');

// Create a variable to store the received messages
const savedMessages = [];

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function handleMessage(message) {
    const receivedMessage = message.contents.toString("utf8"); // Assuming the message content is a string
    savedMessages.push(receivedMessage);
  
    // Perform any additional actions with the message here
    console.log("Received message: " + receivedMessage);
}

function subscribeTopic(client, topicId) {
    // create a new TopicMessageQuery to retrieve messages from the topic  /////
    new TopicMessageQuery()
    .setTopicId(topicId)
    .setStartTime(0)
    .subscribe(client, null, handleMessage); 
}

// Interface for input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function getUserInput() {
    return new Promise(resolve => {
      rl.question('>', answer => {
        resolve(answer);
      });
    });
}

async function main() {
    //////////// Connection Establishment starts ////////////////////////////////////
    //Grab your Hedera testnet account ID and private key from your .env file
    const myAccountId = process.env.MY_ACCOUNT_ID;
    const myPrivateKey = process.env.MY_PRIVATE_KEY;

    // Create our connection to the Hedera network
    const client = Client.forTestnet();
    client.setOperator(myAccountId, myPrivateKey);
    console.log('\nhashstore.js: Connected to Testnet!');
    console.log('------------------------------------------------------');

    // If we weren't able to grab it, we should throw a new error
    if (!myAccountId || !myPrivateKey) {
        throw new Error(
            "Environment variables MY_ACCOUNT_ID and MY_PRIVATE_KEY must be present"
        );
    }

    ///////////////// Get hash //////////////////////////////////////////////////////
    console.log('\nReceiving Hash, waiting...');
    // Grab Topic ID from a User
    let topicId = await getUserInput();
    // subscriber.js가 index.js의 토픽을 구독하여 해시 h1을 얻는다.
    subscribeTopic(client, topicId);
    await sleep(2000);

    ///////////////////////// 시간이 지나서, 무결성 검사위해 해시 요청 받음 ////////            
    ///////////////////////////// Get request to send hash /////////////////////////////////////////////////////////////
    console.log('\nGetting a request for hash...');
    topicId = await getUserInput();

    subscribeTopic(client, topicId);
    await sleep(2000);

    ///////////////////////////// Send hash namager.js /////////////////////////////////////////////////////
    console.log('\nSending hash...');

    const transaction = new TopicCreateTransaction();

    // Sign with the client operator private key and submit the transaction to a Hedera network
    const txResponse = await transaction.execute(client);

    // Request the receipt of the transaction
    const receipt = await txResponse.getReceipt(client);

    // Get the topicID 
    const newTopicId = receipt.topicId;
    console.log('\nTopic ID: ' + newTopicId);

    // Create a new TopicMessageSubmitTransaction
    await new TopicMessageSubmitTransaction({
                    topicId: newTopicId, 
                    message: savedMessages[0], 
                }).execute(client);
} 

main();

