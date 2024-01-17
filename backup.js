const readline = require('readline');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const nfhLiveConnectionString = 'mongodb://localhost:27017/nfh-live';
const phtCoreConnectionString = 'mongodb://localhost:27017/pht-core';
const userId = '6228ab08df39784c4acd8821';

const connectToMongoDB = async () => {
  const clientNfhLive = new MongoClient(nfhLiveConnectionString);
  const clientPhtCore = new MongoClient(phtCoreConnectionString);

  try {
      await clientNfhLive.connect();
      console.log('Connected to Nfh-Live MongoDB!');

      const databaseNfhLive = clientNfhLive.db('nfh-live');
      const collectionNfhLive = databaseNfhLive.collection('user');

      const query = { _id: new ObjectId(userId) };
      const user = await collectionNfhLive.findOne(query);
      const fileObj = user.fileUploads;

      if (user) {
          await handleCommandLineInput(clientPhtCore, fileObj);
      } else {
          console.log('User not found');
      }
  } catch (error) {
      console.error('Error connecting to MongoDB:', error);
  } finally {
      await clientNfhLive.close();
  }
};


const handleCommandLineInput = async (clientPhtCore, fileObj) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (line) => {
            const completions = fs.readdirSync('./').filter(file => file.startsWith(line));
            return [completions, line];
        },
    });

    rl.question('Enter the folder path: ', async (folderPath) => {
        rl.question('Enter folder that you want to create: ', async (folderName) => {
            if (!fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory()) {
                console.error(`Error: Folder '${folderPath}' not found or invalid.`);
                rl.close();
                return;
            }

            rl.close();

            await uploadFilesToPhtCore(clientPhtCore, fileObj, folderPath, folderName);
        });
    });
};

const uploadFilesToPhtCore = async (clientPhtCore, fileObjs, folderPath, folderName) => {
  await clientPhtCore.connect();
  console.log('Connected to Pht-core MongoDB!');

  const databasePhtCore = clientPhtCore.db('pht-core');
  const collectionPhtCore = databasePhtCore.collection('user');

  for (const fileObj of fileObjs) {
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

              await collectionPhtCore.insertOne(newFileObj);
              console.log("Inserted into pht-core", newFileObj);

              const command = `curl -X PUT --data-binary @${filePath} \
                  -H "x-ms-blob-type: BlockBlob" \
                  "https://logsirustorage.blob.core.windows.net/pht-migration/${folderName}/${uniqueName}?st=2024-01-09T05:32:20Z&se=2124-01-10T13:32:20Z&si=allowall&sv=2022-11-02&sr=c&sig=uE%2Fs0ef9CPrAqzLCEMHG5imz7ZyU7yOQXTllHyZEiTA%3D"`;

              exec(command, (error, stdout, stderr) => {
                  if (error) {
                      console.error(`Error: ${error.message}`);
                      return;
                  }
                  // if (stderr) {
                  //     console.error(`Command error: ${stderr}`);
                  //     return;
                  // }
              });
          }
      }
  }

  await clientPhtCore.close();
};

connectToMongoDB();
