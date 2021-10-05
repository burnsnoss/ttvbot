// Twitch Chatbot by Burnsnoss

// twitch chat connection tools
const tmi = require('tmi.js');

// filestream
const fs = require('fs');

// for env variables
require('dotenv').config();

// jsdom stuff so you can use jQuery
var jsdom = require('jsdom');
const { JSDOM } = jsdom;
const { window } = new JSDOM();
const { document } = (new JSDOM('')).window;
global.document = document;
// jQuery
var $ = jQuery = require('jquery')(window);




// TODO: use twitch API to get user_id 
// for now just use env
const channelID = process.env.CHANNEL_ID;
const channelName = process.env.CHANNEL_NAME;

// Define configuration options for twitch
const opts = {
  identity: {
    username: process.env.BOT_USERNAME,
    password: process.env.OAUTH_TOKEN
  },
  channels: [
    channelName
  ]
};

// Connect to twitch IRC
// Create a client with our options
const client = new tmi.client(opts);
// Register our event handlers (defined below)
client.on('message', onMessageHandler);
// Connect to Twitch:
client.connect();
client.on('connected', onConnectedHandler);





// TODO: IMPLEMENT THIS
// if (process.argv[2] == '-dev') { set up dev environment }




// config stuff for Google Cloud Translate API
const {Translate} = require('@google-cloud/translate').v2;
const GCT_CREDS = JSON.parse(process.env.TRANSLATE_CREDS);
const translator = new Translate({
    credentials: GCT_CREDS,
    projectId: GCT_CREDS.project_id
});
// retrieve list of foreign chatters from foreign chatters file
let foreign_chatters = fs.readFileSync('./translate.txt').toString().split('\n');



// ribbon emoji for printing quotes
let ribbon = String.fromCodePoint(0x1F380);



// Called every time a message comes in
function onMessageHandler (target, context, msg, self) {
  if (self) { return; } // Ignore messages from the bot
  // console.log(context); 
  msg = msg.toLowerCase();

  
  // check for bigfollows bots and remove their messages from chat
  if (msg.includes('bigfollows')) {
    // use twitch API to check if they're a follower
    $.ajax({
      type: 'GET',
      url: `https://api.twitch.tv/helix/users/follows?from_id=${context['user-id']}&to_id=${channelID}`,
      headers: {
        'Client-ID': process.env.TTV_CLIENT_ID,
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`
      },
      success: function(data) {
        // time them out if they dont follow
        console.log('bigfollows bot:');
        console.log(data);
        if (data.total == 0 || data.total == null) {
          client.say(target, `/timeout ${context['display-name']} 10`);
        }
      }
    });
   client.say(target, `/timeout ${context['display-name']} 10`);
  }





  // CHECKING COMMANDS WITH ARGUMENTS

  // addquote - adds a quote to the quote file and quoteCounter
  if (msg.substring(0, 10) == "!addquote " && target == channelName) {
    // rest of message is quote to add. check if it's empty
    let quote = msg.substring(10, msg.length);
    if (quote == '') {
      console.log('Error: no arg in addquote, must provide a quote');
      return;
    }
    addQuote(quote);
    return;
  }

  // stonks - brings up latest stock price of given ticker
  if (msg.substring(0,8) === '!stonks ') {
    // they must pass a stock symbol 
    let ticker = msg.substring(8, msg.length);
    if (ticker == '') {
      console.log('Error: no arg in !stonks, must provide a stock symbol');
      return;
    }

    // check for STONKS_KEY
    if (process.env.STONKS_KEY == null) {
      console.log('Error: no API key for stonks command');
      return;
    }

    let url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${ticker}&interval=5min&apikey=` + process.env.STONKS_KEY;  

    // make the request
    $.ajax({
      url: url,
      dataType: 'json',
      headers: {'User-Agent': 'request'},
      success: function(data) {
        if (data == null) {
          console.log('Error: stonks API call');
        }
        else {
          let rawdata = JSON.parse(data);
          console.log(rawdata);
          // print most recent stock price
          for (let ts in rawdata['Time Series (5min)']) {
            client.say(target, `${ticker} - ${ts}`);
            // only loop once bc this is the most recent price
            break;
          } 
        }
      }
    });
    return;
  }

  // !translate - adds a chatter to the translate file
  if (msg.substring(0, 11) == '!translate ') {
    let username = msg.substring(11, msg.length);
    if (username == '') {
      console.log('Error: username not given in translate command');
      return;
    }
    // add user to translate.txt
    // if file doesn't exist, add first username, no newline
    if (fs.existsSync('./translate.txt')) {
      fs.appendFileSync('./translate.txt', username);
    }
    fs.appendFile('translate.txt', '\n' + username, function (err) {
      // check for error/log to console for posterity
      if (err) throw err;
      console.log(`saved ${username} to translate.txt`);
    });
    return;
  }




  // CHECKING TRIMMED MESSAGE

  // Remove whitespace from chat message
  let command = msg.trim();

  // If the command is known, let's execute it
  if (command === '!d20') {
    const num = rollDice(command);
    client.say(target, `You rolled a ${num}`);
    return;
  }

  if (command === '!quote') {
    let quotes = getQuotes();
    let q = quotes[Math.floor(Math.random()*quotes.length)];
    client.say(target, `${ribbon} ${q} ${ribbon}`);
    increaseQuoteCounter(q);
    return;
  }

  if (command === '!topquotes' || command === '!topquote') {
    let topQuotesMsg = topQuotes();
    client.say(target, `${topQuotesMsg}`);
    return;
  }

  // TODO: have this auto-grab most recent youtube video
  // if (command === '!video') {

  // }

  
  



  // CHECK FOR TRANSLATED USERS
  if (foreign_chatters.indexOf(context.username)) {
    client.say(target, translateText(msg, detectLanguage(msg)));
    return;
  }
}



// TRANSLATE HELPERS 

const detectLanguage = async (text) => {
  try {
    let response = await translator.detect(text);
    return response[0].language;
  } catch (error) {
    console.log(`Error at detectLanguage --> ${error}`);
    return 0;
  }
}

const translateText = async (text, targetLanguage) => {
  try {
    let [response] = await translator.translate(text, targetLanguage);
    return response;
  } catch (error) {
    console.log(`Error at translateText --> ${error}`);
    return 0;
  }
}




// QUOTE HELPERS
// get list of all quotes 
function getQuotes() {
  let quotes = fs.readFileSync('./quotes.txt').toString().split("\n");
  for (let i = 0; i < quotes.length; i++) {
    quotes[i] = quotes[i].replace("\r", "");
  }
  return quotes;
}

// gets and parses contents of the quote counter json file
function getQuoteHisto() {
  let rawdata = fs.readFileSync('./quoteCounter.json');
  return JSON.parse(rawdata);
}

// writes the quotes histogram to the quote counter json file
function setQuoteHisto(histo) {
  let histoString = JSON.stringify(histo);
  fs.writeFileSync('./quoteCounter.json', histoString);
  return;
}

// increases the count of the quote in the quoteCounter
function increaseQuoteCounter(quote) {
  let quoteHisto = getQuoteHisto();
  quoteHisto[quote] += 1;
  setQuoteHisto(quoteHisto);
  return;
}

// adds a new quote to the quotes file and counter
function addQuote(quote) {
  // if file doesn't exist, we have to add just the quote, no newline
  if (fs.existsSync('./quotes.txt')) {
    // append quote to quotes file
    fs.appendFileSync('./quotes.txt', quote);
  }
  else {
    // append newline separator and quote to quotes file
    fs.appendFileSync('./quotes.txt', "\n" + quote);
  }

  // update json file with new quote for quote counter
  let quoteHisto = getQuoteHisto();
  // it's a new quote so its frequency is 0
  quoteHisto[quote] = 0;
  setQuoteHisto(quoteHisto);
  return;
}

// returns top 3 quotes from quoteCounter
function topQuotes() {
  let rawdata = fs.readFileSync('./quoteCounter.json');
  let quoteHisto = JSON.parse(rawdata);
  let sortable = [];
  for (let q in quoteHisto) {
    sortable.push([q, quoteHisto[q]]);
  }
  // sort by values of json obj
  sortable.sort(function(a, b) {
    return -1 * (a[1] - b[1]);
  });
  // print top 3 quotes
  let output = ribbon + " ";
  for (let i = 0; i < 3; i++) {
    output += sortable[i][0] + ": " + sortable[i][1] + " " + ribbon + " ";
  }
  return output;
}




// MISCELLANEOUS HELPERS
// Function called when the "dice" command is issued
function rollDice () {
  const sides = 20;
  return Math.floor(Math.random() * sides) + 1;
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
}
