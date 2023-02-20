const fs = require('fs');

let sidebar = {
  accounts: {
    clear: function() {
      $('#sidebar-accounts').empty()
    },
    add: function(account) {
      //console.debug('[sidebar.js] Adding', account)
      $('#sidebar-accounts').append(`<div class="box-user" data-username="${account.username}" data-auth="${account.authentication}" data-tippy-content="${account.username} <ul style='padding-left: 14px;'><li>auth: ${account.authentication}</li></ul>">
        <div class="account-delete" style="position: relative;">
        <div class="delete-account" account-delete="${account.username}" style="cursor: pointer; display: none; top: 0; right: 0; position: absolute; color: indianred; border: 2px solid #7e7e7e; border-radius: 25px; padding: 1.5px 3px;">X</div>
        <div class="box-img">
          <img src="https://mc-heads.net/head/${account.username}/nohelm">
        </div>
        </div>
      </div>`)
    }
  },
  addListeners: function() {
    $('#sidebar-accounts').on('mouseover', 'div.box-user', function(e) {
      let elCurrentTarget = $(e.currentTarget); // .box-user
      elCurrentTarget.find('.delete-account').show()
    });

    // Delete Account
    $('#sidebar-accounts').on('mouseout', 'div.box-user', function(e) {
      let elCurrentTarget = $(e.currentTarget); // .box-user
      elCurrentTarget.find('.delete-account').hide()
    });

    // Open console for this user--
    $('#sidebar-accounts').on('click', 'div.box-user', function(e) {
      let el = $(e.currentTarget);
      let elClickedElement = $(e.target);

      let username = $(el).data('username');
      let auth = $(el).data('auth');

      if(elClickedElement.attr('account-delete')) return database.removeAccount(username);
      
      let term_command = `connect -u ${username}`;
      if (auth) term_command += ` -a ${auth}`;
      term_command += ` -h `;

      term.set_command(term_command);
      setTimeout(function() {
        term.focus(); // requires a small timeout
      }, 10)
    })

    // Open User Editor (User right clicked on a user)
    $(document).on("contextmenu", "#sidebar-accounts .box-user", function(e) {
      e.preventDefault();
      let el = $(e.currentTarget);
      let username = $(el).data('username');
      let auth = $(el).data('auth');

      return false;
    });
  }
}
sidebar.addListeners();
