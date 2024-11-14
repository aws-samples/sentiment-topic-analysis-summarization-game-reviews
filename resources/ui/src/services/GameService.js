import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

const url = import.meta.env.VITE_API_URL

export const fetchGames = async () => {
    try {
        const response = await fetch(url + '/games');
        if (!response.ok) {
            throw new Error('Failed to fetch games');
        }
        const data = await response.json();
        return data
    } catch (err) {

    }
};

export const fetchGamesByUser = async () => {
    console.log("current user", await getCurrentUser())
    try {
        const response = await fetch(url + '/games?user_id');
        if (!response.ok) {
            throw new Error('Failed to fetch games');
        }
        const data = await response.json();
        return data
    } catch (err) {

    }
}

export const createGame = async (title) => {
    try {
        const session = await fetchAuthSession()
        const accessToken = session.tokens.idToken
        const user = await getCurrentUser();
        const response = await fetch(url + '/games', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                title
            }),
        });
        if (!response.ok) {
            const message = await response.json();
            throw new Error(message.detail);
        }
        const data = await response.json();
        return data
    } catch (err) {
        console.log(err);
    }
};

export const deleteGameRequest = async (id) => {
    try {
        const session = await fetchAuthSession()
        const accessToken = session.tokens.idToken
        await fetch(url + '/games/' + id, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
        });
    } catch (err) {
        console.log(err);
    }
};

export const updateGame = async (id, title) => {
    try {
        const session = await fetchAuthSession()
        const accessToken = session.tokens.idToken
        const response = await fetch(url + '/games/' + id, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ title }),
        });
        if (!response.ok) {
            const message = await response.json();
            throw new Error(message.detail);
        }
        const data = await response.json();
        return data
    } catch (err) {
        console.log(err);
    }
};
