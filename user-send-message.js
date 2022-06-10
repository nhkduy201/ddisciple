import got from 'got'

export default {
    token: undefined,
    setToken: function(token) {
        this.token = token
        return this
    },
    send: function(message, channelId) {
        got.post(`https://discord.com/api/v9/channels/${channelId}/messages`, {
            json: {
                content: message
            },
            headers: {
                authorization: this.token
            }
        })
    }
}