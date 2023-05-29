// 사전에 영상을 s3에 업로드한다. (이 부분은 다른 컴포넌트에서 해야 함)
// 영상을 s3 가져온다. (지금은 일단 로컬에서 가져온다.)
// 이 영상의 해시 hashFromOriginalFile을 구한다.
// 해시 hashFromOriginalFile을 토픽으로 발행한다. 
// *hashstore.js가 이 토픽을 구독하여 해시 h1을 얻는다. 
// 시간이 지나 무결성 검사를 하려고 한다. 
  // s3에서 이 영상을 가져온다. (지금은 일단 로컬에서 가져온다.)
  // 가져온 이미지를 해싱해 h2를 얻는다. 
  // hashstore.js에게 해시 h1을 달라고 요구한다
  // *hashstore.js가 이 토픽을 구독하고 해시 h1을 manager.js로 보낸다. 
  // h1과 h2를 비교하여 무결성을 검사한다. 

const crypto = require('crypto');
const { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, TopicMessageQuery } = require('@hashgraph/sdk');
require("dotenv").config();
const fs = require('fs');
const readline = require('readline');

// Create a variable to store the received messages
const savedMessages = [];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

async function publishTopic(client, data) {
    ////////////////////////// 해시 h1을 토픽으로 발행한다. /////////////////////////
    // First, create a topic 
    const transaction = new TopicCreateTransaction();

    // Sign with the client operator private key and submit the transaction to a Hedera network
    const txResponse = await transaction.execute(client);

    // Request the receipt of the transaction
    const receipt = await txResponse.getReceipt(client);

    // Get the topicID 
    const newTopicId = receipt.topicId;
    console.log('\nTopic creation complete! Topic ID: ' + newTopicId);
    console.log('------------------------------------------------------');

    await new TopicMessageSubmitTransaction({
        topicId: newTopicId, 
        message: data, 
    }).execute(client);
}

// Function to calculate the hash of a multimedia file
function calculateHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath); 
        // TODO: 여기를 s3 부분으로 바꿔야 함
        // https://github.com/rosacomputer/programming_practice/blob/main/awsS3HederaCllient.js 여기 보고 할 것 
        // s3 조작법은 여기 참고 : https://www.youtube.com/watch?v=5S_QHyPA7H4

        stream.on('data', (data) => {
          hash.update(data);
        });
    
        stream.on('end', () => {
          const calculatedHash = hash.digest('hex');
          resolve(calculatedHash);
        });
    
        stream.on('error', (error) => {
          reject(error);
        });
      });
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

async function main() {
  // Initialize Hedera client
  const client = Client.forTestnet();
  client.setOperator(process.env.MY_ACCOUNT_ID, process.env.MY_PRIVATE_KEY);
  console.log('\nmanager.js: Connected to Testnet!');
  console.log('------------------------------------------------------');

  /////////////////////////// 가져온 데이터의 해시 h1을 구한다. ///////////////
  let filePath = await getUserInput();
  // 데스크탑 - const filePath = 'C:/Users/cshee/OneDrive/Desktop/BDD100K(local)/bdd100k_videos_test_00/bdd100k/videos/test/cabc30fc-e7726578.mov';
  // 윈도우 노트북 - const filePath = 'C:/Users/VCC211116/Downloads/bdd100k_videos_test_00/bdd100k/videos/test/cd35ea13-1ecb210c.mov';

  const hashFromOriginalFile = await calculateHash(filePath);
  console.log('\nCreated hash h1: ' + hashFromOriginalFile);
  console.log('------------------------------------------------------');

  /////////////////////////////// 해시를 보낸다. /////////////////////////////////////////////
  console.log('\nSending hash, wait...');
  console.log('------------------------------------------------------');
  publishTopic(client, hashFromOriginalFile); 

  ///////////////////////// hashstore 가 해시 받을 때까지 대기 ////////////////
  await sleep(3000);

  console.log('Enter any key to continue');
  await getUserInput();

  /////////// 시간이 지나서, 무결성 검사를 위해 hashstore 에게 해시 요청 /////////
  console.log('------------------------------------------------------');
  console.log("\nSending \'GET_HASH\'");
  publishTopic(client, "GET_HASH");  
  await sleep(3000);
  
  console.log("Enter Topic Id");
  topicId = await getUserInput();

  /////////// 해시가 들어있는 토픽 구독 /////////////////////////
  subscribeTopic(client, topicId);
  await sleep(3000);

  console.log('Enter any key to continue');
  await getUserInput();

  ///////////////// 시간이 지나서, 무결성 검사 //////////////////

  ///////////////// h1: hashstore.js에서 가져온 것 ////////////////
  const h1 = savedMessages[0];
  console.log('\nCreated hash h1 from hashstore.js: ' + h1);
  console.log('------------------------------------------------------');

  ///////////////////// h2: 가져온 원본 데이터 해싱하여 h2 얻기 /////////////////////
  ///////////////////// 이미 s3업로드 되었다고 생각하고 지금은 s3 대신 로컬에서 가져옴 /////////////////////////////////
  const h2 = await calculateHash(filePath);
  console.log('\nCreated hash h2 created from original file: ' + h2);
  console.log('------------------------------------------------------');

  /////////////////////// h1과 h2를 비교하여 무결성을 검사한다. //////////
  // 해시값 비교 (무결성 검사)
  if(h1 == h2) {
      console.log('\nIntegrity is being offered');
  } else {
      console.log('\nIntegrity is not being offered');
  } 
}

main();
