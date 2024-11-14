import React, { useContext } from 'react';
import {
  Card, Grid, Collection, Button, Heading, Text,
  Flex,
  Menu,
  MenuItem,
  Loader
} from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { BrowserRouter as Router, Route, Routes, Link as RLink } from 'react-router-dom';
import Game from './components/Game';

import { Authenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';
import { GameContext, useGameContext } from './contexts/GamesContext';
import UploadForm from './components/UploadForm';

import { AWS_USER_POOL_ID, AWS_IDENTITY_POOL_ID, AWS_USER_POOL_CLIENT_ID } from './aws-config.js'
import JobForm from './components/JobForm';
import JobPage from './components/JobPage';


Amplify.configure({
  Auth: {
    Cognito: {
      "userPoolId": AWS_USER_POOL_ID,
      "identityPoolId": AWS_IDENTITY_POOL_ID,
      "userPoolClientId": AWS_USER_POOL_CLIENT_ID
    }
  }
})

function App() {

  const { games } = useContext(GameContext);
  const { loading } = useGameContext();

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <Router>
          <Grid columnGap="0.5rem"
            rowGap="0.5rem"
            templateColumns="15rem 1fr"
            templateRows="auto auto 1fr">

            <Card columnStart="1" columnEnd="-1" variation="elevated">

              <Flex direction="row">
                <Menu>
                  <MenuItem onClick={signOut}>Sign Out</MenuItem>
                </Menu>
                <Heading level="1">Game Reviews Analysis</Heading>

              </Flex>
            </Card>
            <Card variation='elevated'>
              <Flex direction="column">
                <Flex direction="row">
                  <Heading level="3">Games</Heading>
                  {loading && <Loader />}
                </Flex>

                <Collection
                  items={games}
                  type="list"
                  searchNoResultsFound={
                    <></>
                  }
                >
                  {(game, index) => (

                    <RLink to={`/games/${game.id}`} key={index}>{game.title}</RLink>

                  )}
                </Collection>
              </Flex>
            </Card>
            <Card variation='elevated'>
              <Routes>
                <Route path="/" element={<Game />} />
                <Route path="/games" element={<Game />} />
                <Route path="/games/:id" element={<Game />} />
                <Route path="/games/:gameId/jobs/:jobId/upload-reviews" element={<UploadForm />} />
                <Route path="/games/:gameId/jobs/:jobId" element={<JobPage />} />
                <Route path="/games/:gameId/jobs/new" element={<JobForm />} />
                <Route path="*" element={<Text>Not Found</Text>} />
              </Routes>
            </Card>
          </Grid>
        </Router>
      )}
    </Authenticator>
  )
}

export default App
