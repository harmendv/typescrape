const isUrl = require('./utils/isUrl.js');
const ErrorHandler = require('./utils/ErrorHandler.js');

class FontScraper {
  constructor(args) {
    this.arguments = args;
    this.address;

    if(this.arguments[2]) {
      if(!isUrl(this.arguments[2])) {
        ErrorHandler.throw(new Error('Given argument is not of type URL.'));
      } else {
        this.url = this.arguments[2];
      }
    } else {
      ErrorHandler.throw(new Error('No URL given.'));
    }
  }

  get url() {
    return this.address;
  }

  set url(url) {
    this.address = url;
  }


}

module.exports = FontScraper;
