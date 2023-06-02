// 1. 사전에 영상을 AWS s3에 업로드한다. (이 부분은 다른 컴포넌트에서 해야 한다.)
// 2. 영상 m_1 을 s3로부터 manager.js로 다운로드 받는다. (implementation1 에서는 일단 로컬에서 가져온다.)
// 3. manager.js에서 m_1의 해시 hashFromOriginalFile을 구한다.
// 4. manager.js에서 hashFromOriginalFile을 토픽 t_1으로 발행한다. 
// 5. hashstore.js가 t_1을 구독하여 해시 h1 (hashFromOriginalFile과 내용이 같음) 을 얻는다. 
// 6. 시간이 지나, 무결성 검사를 하려고 한다. 
  // 6.1. s3에서 manager.js로 m_1를 다운로드한다. (지금은 일단 로컬에서 가져온다.)
  // 6.2. manager.js으로 가져온 m_1을 해싱해 h2를 얻는다. 
  // 6.3. manager.js에서 해시 h1을 요청하는 토픽 t_2를 발행한다.
  // 6.4. hashstore.js가 토픽 t_2를 구독하고 해시 h1을 토픽 t_3로 발행한다. 
  // 6.5. manager.js에서 토픽 t_3를 구독하여 h1을 얻는다. 
  // 6.6. manager.js에서 h1과 h2를 비교하여 무결성을 검사한다. 

const crypto = require('crypto');
const AWS = require('aws-sdk'),
      {
        S3
      } = require("@aws-sdk/client-s3");
const { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, TopicMessageQuery, FileId } = require('@hashgraph/sdk');
require("dotenv").config();
const fs = require('fs');
const readline = require('readline');

// Create a variable to store the received messages
const savedMessages = [];

////////////////////////////////////////////////////////////
// Configure AWS SDK with your AWS credentials and region
AWS.config.update({
  accessKeyId: 'ENTER HERE',
  secretAccessKey: 'ENTER HERE',
  region: 'ENTER HERE'
});


// Create an instance of the AWS S3 client
const s3 = new S3();

// Define the S3 bucket details
const bucketName = process.env.AWS_S3_BUCKET_NAME;
const objectKey = process.env.AWS_S3_OBJECT_KEY;
////////////////////////////////////////////////////////

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
function calculateHash(fileData) {
  const hash = crypto.createHash('sha256');
  hash.update(fileData);
  return hash.digest('hex');
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

// Download the file from S3 bucket and store it on Hedera Hashgraph ////////////////////////////
async function downloadFromS3() {
  try {
    const { Body } = await s3.getObject({ Bucket: bucketName, Key: objectKey });
    return Body;
  } catch (error) {
    console.error('Error downloading file from S3:', error);
    throw error;
  }
}
///////////////////////////////////////////////////////////////////////////////////////////////

async function main() {
  // Initialize Hedera client
  const client = Client.forTestnet();
  client.setOperator(process.env.MY_ACCOUNT_ID, process.env.MY_PRIVATE_KEY);
  console.log('\nmanager.js: Connected to Testnet!');
  console.log('------------------------------------------------------');

  ////////// Get Data From AWS S3 ///////////////////////////////////////////
  // Install AWS SDK for JavaScript (aws-sdk)   !!!!!!!!!!!!
  // Invoke the function to start the download process
  const fileData = await downloadFromS3();

  /////////////////////////// 가져온 데이터의 해시 h1을 구한다. ///////////////
  const hashFromOriginalFile = await calculateHash(fileData);
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
  const fileData2 = downloadFromS3ToHedera(client); // data를 넣도록
  
  const h2 = await calculateHash(fileData2);
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
