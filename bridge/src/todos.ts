import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const TODOS_DIR = path.join(os.homedir(), '.laycode', 'todos')

interface Todo {
  id: string
  text: string
  done: boolean
  urgent: boolean
  createdAt: number
  updatedAt: number
}

interface TodoList {
  directory: string
  items: Todo[]
  updatedAt: number
}

function ensureDir() {
  if (!fs.existsSync(TODOS_DIR)) {
    fs.mkdirSync(TODOS_DIR, { recursive: true })
  }
}

function dirToFilename(directory: string): string {
  return Buffer.from(directory).toString('base64url')
}

function filePathFor(directory: string): string {
  return path.join(TODOS_DIR, dirToFilename(directory) + '.json')
}

export function readTodos(directory: string): TodoList {
  ensureDir()
  const fp = filePathFor(directory)
  if (!fs.existsSync(fp)) {
    return { directory, items: [], updatedAt: Date.now() }
  }
  try {
    const raw = fs.readFileSync(fp, 'utf-8')
    return JSON.parse(raw) as TodoList
  } catch {
    return { directory, items: [], updatedAt: Date.now() }
  }
}

function writeTodos(list: TodoList) {
  ensureDir()
  list.updatedAt = Date.now()
  fs.writeFileSync(filePathFor(list.directory), JSON.stringify(list, null, 2), 'utf-8')
}

export function addTodo(directory: string, text: string): Todo {
  const list = readTodos(directory)
  const todo: Todo = {
    id: crypto.randomUUID(),
    text,
    done: false,
    urgent: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  list.items.push(todo)
  writeTodos(list)
  return todo
}

export function updateTodo(directory: string, id: string, update: { text?: string; done?: boolean; urgent?: boolean }): Todo | null {
  const list = readTodos(directory)
  const item = list.items.find(t => t.id === id)
  if (!item) return null
  if (update.text !== undefined) item.text = update.text
  if (update.done !== undefined) item.done = update.done
  if (update.urgent !== undefined) item.urgent = update.urgent
  item.updatedAt = Date.now()
  writeTodos(list)
  return item
}

export function deleteTodo(directory: string, id: string): boolean {
  const list = readTodos(directory)
  const idx = list.items.findIndex(t => t.id === id)
  if (idx === -1) return false
  list.items.splice(idx, 1)
  writeTodos(list)
  return true
}
