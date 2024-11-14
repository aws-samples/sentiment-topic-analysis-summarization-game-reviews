import { View, Flex, Button, TextAreaField, Input, Label, Loader, Collection, ScrollView, Divider } from '@aws-amplify/ui-react';
import { useGameContext } from '../contexts/GamesContext';
import {useEffect, useState} from "react";

export default function Chat({gameId, jobId}) {

  const [prompt, setPrompt] = useState("")
  const [response, setResponse] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [chatHistory, setChatHistory] = useState([])

  const {converse} = useGameContext();

  const converseHandler = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await converse(gameId, jobId, prompt)
      if(response === null) {
        setError("Could not get a response")
      }
      const responseText = JSON.parse(response.body).content[0].text
      setResponse(responseText)
      setChatHistory([...chatHistory, {prompt, responseText}])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    
  }

  const handleChange = (event) => {
    setPrompt(event.target.value)
  }

  useEffect(() => {
    setResponse("")
  }, [gameId, jobId])

  return (
    <View>
      <Flex direction="column">
        <ScrollView height="300px">
        <Collection items={chatHistory}>
          {(item, index) => {
            return (
              <Flex direction="column" key={index}>
                <Label>Prompt: {item.prompt}</Label>
                <Label>Response: {item.responseText}</Label>
              </Flex>
            )
          }}
        </Collection>
        </ScrollView>
        <Divider />
        <Flex direction="column">
          <Label><strong>Ask:</strong> {loading && (<Loader />)}</Label>
          
        <Input value={prompt} onChange={handleChange} />
        </Flex>
        <Button onClick={converseHandler} variation='primary'>Send</Button>
      </Flex>
    </View>
  )
}