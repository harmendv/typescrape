const PrettyError = new (require('pretty-error'))();

class ErrorHandler  {
  static throw(message) {
    console.log(PrettyError.render(new Error(message)));
  }
}

module.exports = ErrorHandler;