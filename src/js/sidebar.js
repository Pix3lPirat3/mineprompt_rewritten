const fs = require('fs');

let storage_accounts = JSON.parse(fs.readFileSync(__dirname + '/../storage/accounts.json', 'utf8'));

fs.readFile(__dirname + '/../storage/accounts.json', (err, data) => {
  if (err) console.log(err);
  storage_accounts = JSON.parse(data)
  loadSidebarAccounts();
});


function loadSidebarAccounts() {
  $('#sidebar-accounts').empty()
  storage_accounts.forEach(function(account) {
    $('#sidebar-accounts').append(`<div class="box-user" data-username="${account.username}" data-auth="${account.auth}" data-tippy-content="${account.username} <ul style='padding-left: 14px;'><li>auth: ${account.auth}</li><li>right-click to delete</li></ul>">
      <div class="box-img">
        <img src="https://mc-heads.net/head/${account.username}/nohelm">
      </div>
    </div>`)
  })
}


// Handles adding a new account
$('#form-add-account').on('submit', function(e) {
  e.preventDefault();
  let username = $('#form-add-account-username').val().trim();
  let auth = $('#form-add-account-auth').val();

  let existing_index = storage_accounts.findIndex(i => i.username == username); // -1 = Does Not Exist (otherwise it returns the index of a found item)
  if (existing_index > -1) {
    storage_accounts[existing_index] = {
      username: username,
      auth: auth
    }
  } else {
    storage_accounts.push({
      username: username,
      auth: auth
    })
  }
  fs.writeFileSync(__dirname + '/../storage/accounts.json', JSON.stringify(storage_accounts), 'utf8');

  loadSidebarAccounts();
})

// Open console for this user--
$('#sidebar-accounts').on('click', '.box-user', function(e) {
  let el = $(e.currentTarget);
  let username = $(el).data('username');
  let auth = $(el).data('auth');
  console.log(username, auth)
  let term_command = `connect -u ${username}`;
  if (auth) term_command += ` -a ${auth}`;
  term_command += ` -h `;

  term.set_command(term_command);
  term.focus();
})

// Open User Editor (User right clicked on a user)
$(document).on("contextmenu", "#sidebar-accounts .box-user", function(e) {
  e.preventDefault();
  let el = $(e.currentTarget);
  let username = $(el).data('username');
  let auth = $(el).data('auth');
  window.console.log('EDITING:', username, auth)

  /*
  HOW TO REMOVE ACCOUNTS:
  storage_accounts = storage_accounts.filter(function( obj ) {
    return obj.username !== username;
  });

  fs.writeFileSync(__dirname + '/../storage/accounts.json', JSON.stringify(storage_accounts), 'utf8');

  */

  loadSidebarAccounts()

  window.console.log(storage_accounts)

  //openAccount(username, auth)
  return false;
});