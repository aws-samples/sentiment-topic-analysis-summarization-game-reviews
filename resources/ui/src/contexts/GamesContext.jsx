import React, { createContext, useState, useContext, useEffect } from 'react';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

export const GameContext = createContext();

export const useGameContext = () => useContext(GameContext);

export const GameProvider = ({ children }) => {

  const url = import.meta.env.VITE_APP_API_GATEWAY_ENDPOINT

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(true)

  const getAuthHeaders = async () => {
    const session = await fetchAuthSession()
    const accessToken = session.tokens.idToken
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
  };

  const fetchReviews = async (gameId, jobId) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url + `/games/${gameId}/analysis-jobs/${jobId}/reviews`, {headers});
      if (!response.ok) throw new Error('Failed to fetch reviews');
      const data = await response.json();
      return data;
    }
    catch (err) {
      setError(err.message);
      throw err;
    }
  }

  const fetchGames = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url +'/games', {headers});
      if (!response.ok) throw new Error('Failed to fetch games');
      const data = await response.json();
      setGames(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchGamesByUserId = async () => {
    try {
      const user = await getCurrentUser();
      const headers = await getAuthHeaders();
      setLoading(true)
      const response = await fetch(url +'/games', {headers});
      if (!response.ok) throw new Error('Failed to fetch games');
      const data = await response.json();
      setGames(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchGame = async (id) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url+`/games/${id}`, {headers});
      if (!response.ok) throw new Error('Failed to fetch game');
      const data = await response.json();
      //update game in games array
      setGames(games.map(game => game.id === id ? data : game));

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const fetchJob = async (gameId, jobId) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url+`/games/${gameId}/analysis-jobs/${jobId}`, {headers});
      if (!response.ok) throw new Error('Failed to fetch job');
      const data = await response.json();
      //update job in game in games
      setGames(games.map(game => game.id === gameId ? {...game, jobs: game.jobs.map(job => job.id === jobId ? data : job)} : game));
      console.log(games)
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  useEffect(() => {
    fetchGamesByUserId();
  }, []);

  const deleteGame = async (id) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${url}/games/${id}`, { 
        method: 'DELETE',
        headers 
      });
      if (!response.ok) throw new Error('Failed to delete game');
      setGames(games.filter(game => game.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const selectGame = (game) => {
    setSelectedGame(game);
  };

  const addGame = async (game) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url+'/games', {
        method: 'POST',
        headers,
        body: JSON.stringify(game),
      });
      if (!response.ok) throw new Error('Failed to add game');
      const newGame = await response.json();
      setGames([...games, newGame]);
      return newGame;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateGame = async (id, updatedGame) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url+`/games/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedGame),
      });
      if (!response.ok) throw new Error('Failed to update game');
      const updated = await response.json();
      setGames(games.map(game => game.id === id ? updated : game));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const getGame = (gameId) => {
    return games.find((game) => game.id === gameId);
  };

  const addJob = async (gameId, jobName, jobDescription) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url+`/games/${gameId}/analysis-jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({gameId, job_name:jobName, job_description:jobDescription}),
      });
      if (!response.ok) throw new Error('Failed to add job');
      const newJob = await response.json();
      // setJobs([...jobs, newJob]);
      return newJob;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const getJob = (gameId, jobId) => {
    const game = games.find((game) => game.id === gameId)
    return game.jobs.find((job) => job.id === jobId);
  };

  const updateJob = async (gameId, jobId, updatedJob) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url+`/games/${gameId}/analysis-jobs/${jobId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedJob),
      });
      if (!response.ok) throw new Error('Failed to update job');
      const updated = await response.json();
      // setJobs(jobs.map(job => job.id === id ? updated : job));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const submitJob = async (gameId, jobId, filename) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${url}/process-csv?game_id=${gameId}&job_id=${jobId}&filename=${filename}`, {
        method: 'POST',
        headers
      });
      if (!response.ok) throw new Error('Failed to submit job');
      const submittedJob = await response.json();
      // setJobs(jobs.map(job => job.id === id ? submittedJob : job));
      return submittedJob;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteJob = async (gameId, jobId) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url+`/games/${gameId}/analysis-jobs/${jobId}`, {
        method: 'DELETE',
        headers
      });
      if (!response.ok) throw new Error('Failed to delete job');
      // setJobs(jobs.filter(job => job.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const getUploadURL = async (gameId, jobId, filename) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url + `/upload-url?game_id=${gameId}&job_id=${jobId}&filename=${filename}`, {
        method: 'GET',
        headers
      });
      if (!response.ok) throw new Error('Failed to get upload URL');
      const data = await response.json();
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const converse = async (gameId, jobId, input) => {
    try {
      const headers = await getAuthHeaders();
      // headers['Accept'] = 'text/event-stream';
      const response = await fetch(url+`/games/${gameId}/analysis-jobs/${jobId}/converse?input_text=${input}`, {
        method: 'GET',
        headers
      });
      if (!response.ok) throw new Error('Failed to converse');
      const data = await response.json();
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };
  

  const value = {
    games,
    fetchGames,
    fetchReviews,
    fetchGamesByUserId,
    fetchGame,
    addGame,
    updateGame,
    deleteGame,
    selectGame,
    setGames,
    getGame,
    fetchJob,
    addJob,
    getJob,
    updateJob,
    submitJob,
    deleteJob,
    getUploadURL,
    converse,
    isUpdating,
    setIsUpdating,
    loading,
    error
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};
