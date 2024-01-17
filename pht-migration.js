const readline = require('readline');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let totalFileObjectsInserted = 0;

const nfhLiveConnectionString = 'mongodb://localhost:27017/nfh-live';
const phtCoreConnectionString = 'mongodb://localhost:27017/pht-core';

const connectToMongoDB = async () => {
    const clientNfhLive = new MongoClient(nfhLiveConnectionString);
    const clientPhtCore = new MongoClient(phtCoreConnectionString);
  
    try {
      await clientNfhLive.connect();
      console.log('Connected to Nfh-Live MongoDB!');
  
      const databaseNfhLive = clientNfhLive.db('nfh-live');
      const collectionNfhLive = databaseNfhLive.collection('user');
  
      const users = await collectionNfhLive.find({}).toArray();
  
      for (const user of users) {
        if (!user || !user.fileUploads || user.fileUploads.length === 0) {
          console.log(`Skipping user with _id: ${user._id} - No fileUploads found`);
        } else {
          const fixedFilePath = user.fileUploads[0].filePath.slice(1);
          await handleCommandLineInput(clientPhtCore, user.fileUploads, fixedFilePath);
        }
      }
  
    } catch (error) {
      console.error('Error connecting to MongoDB:', error);
    } finally {
      await clientNfhLive.close();
      await clientPhtCore.close();
    }
  };
  


const handleCommandLineInput = async (clientPhtCore, fileUploads, nfhFolderPath) => {
  const folderName = 'test';
  const completerFolderPath = await getCompleterFolderPath(nfhFolderPath);

  if (completerFolderPath === nfhFolderPath) {
    await clientPhtCore.connect();
    for (const fileObj of fileUploads) {
      await uploadFilesToPhtCore(clientPhtCore, fileObj, nfhFolderPath, folderName);
    }
  } else {
    console.log(`Skipping user with filePath: ${nfhFolderPath}`);
  }
  await clientPhtCore.close();
};


const getCompleterFolderPath = async (nfhFolderPath) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line) => {
        const completions = fs.readdirSync(nfhFolderPath).filter(file => file.startsWith(line));
        return [completions, line];
      },
    });
  
    try {
      return await new Promise((resolve) => {
        rl.on('close', () => {
          const completerFolderPath = path.join(nfhFolderPath, rl.line);
          console.log(`Automatically selected completer folder path: ${completerFolderPath}`);
          resolve(completerFolderPath);
        });
  
          rl.close();
      });
    } finally {
      rl.close();
    }
  };
  
const uploadFilesToPhtCore = async (clientPhtCore, fileObj, folderPath, folderName) => {
 try {
    if (!fs.existsSync(folderPath)) {
        console.log(`Directory not found: ${folderPath}`);
        return;
      }
  
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
  
      if (fs.lstatSync(filePath).isFile()) {
        const fileExtension = path.extname(filePath);
        const fileNameWithoutExtension = path.basename(filePath, fileExtension);
  
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substr(2, 8);
        const uniqueName = `${fileNameWithoutExtension}_${timestamp}_${randomString}${fileExtension}`;
        const uniqueFileName = `${fileNameWithoutExtension}_${timestamp}_${randomString}`;
  
        const newFileObj = { ...fileObj, fileId: uniqueFileName };
  
        await clientPhtCore.connect();
        console.log('Connected to Pht-core MongoDB!');
        const databasePhtCore = clientPhtCore.db('pht-core');
        const collectionPhtCore = databasePhtCore.collection('user');
  
        await collectionPhtCore.insertOne(newFileObj);
        totalFileObjectsInserted++;
        console.log("Inserted into pht-core", newFileObj);
  
        const command = `curl -X PUT --data-binary @${filePath} \
                      -H "x-ms-blob-type: BlockBlob" \
                      "https://logsirustorage.blob.core.windows.net/pht-migration/${folderName}/${uniqueName}?st=2024-01-09T05:32:20Z&se=2124-01-10T13:32:20Z&si=allowall&sv=2022-11-02&sr=c&sig=uE%2Fs0ef9CPrAqzLCEMHG5imz7ZyU7yOQXTllHyZEiTA%3D"`;
  
        exec(command, (error, stdout, stderr) => {
          if(command){
            process.exit(); 
          }
          if (error) {
            console.error(`Error: ${error.message}`);
            return;
          }
          if (stderr) {
            // console.error(`Command error: ${stderr}`);
            return;
          }
        });
      }
    }
 } catch (error) {
    console.error(`Error while processing directory: ${error.message}`);
 }
  console.log("total: ", totalFileObjectsInserted);

  await clientPhtCore.close();
};

connectToMongoDB();
