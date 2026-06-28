package com.evocode.controlplane;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.evocode.controlplane.persistence.MessageRepository;
import com.evocode.controlplane.persistence.ProjectRepository;
import com.evocode.controlplane.persistence.SessionRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ProjectControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired ProjectRepository repo;
    @Autowired SessionRepository sessions;
    @Autowired MessageRepository messages;

    @BeforeEach
    void clean() {
        messages.deleteAll();
        sessions.deleteAll();
        repo.deleteAll();
    }

    @Test
    void create_then_get_and_list() throws Exception {
        String body = mvc.perform(post("/api/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"我的项目\",\"repoPath\":\"/tmp/r\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").isNotEmpty())
            .andExpect(jsonPath("$.name").value("我的项目"))
            .andExpect(jsonPath("$.repoPath").value("/tmp/r"))
            .andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(body).get("id").asText();

        mvc.perform(get("/api/projects/" + id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("我的项目"));

        mvc.perform(get("/api/projects"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(id));
    }

    @Test
    void patch_updates_name_and_clears_repo() throws Exception {
        String body = mvc.perform(post("/api/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"old\",\"repoPath\":\"/tmp/r\"}"))
            .andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(body).get("id").asText();

        mvc.perform(patch("/api/projects/" + id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"new\",\"repoPath\":\"\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("new"))
            .andExpect(jsonPath("$.repoPath").doesNotExist());
    }

    @Test
    void delete_removes_project() throws Exception {
        String body = mvc.perform(post("/api/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"x\"}"))
            .andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(body).get("id").asText();

        mvc.perform(delete("/api/projects/" + id)).andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/" + id)).andExpect(status().isNotFound());
        // 幂等：再次删除返回 404
        mvc.perform(delete("/api/projects/" + id)).andExpect(status().isNotFound());
    }

    @Test
    void delete_cascades_sessions_and_messages() throws Exception {
        String body = mvc.perform(post("/api/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"casc\"}"))
            .andReturn().getResponse().getContentAsString();
        String pid = mapper.readTree(body).get("id").asText();

        String sBody = mvc.perform(post("/api/sessions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":\"" + pid + "\",\"title\":\"s\"}"))
            .andReturn().getResponse().getContentAsString();
        String sid = mapper.readTree(sBody).get("id").asText();

        mvc.perform(post("/api/sessions/" + sid + "/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"user\",\"kind\":\"intent\",\"text\":\"hi\"}"))
            .andExpect(status().isOk());

        mvc.perform(delete("/api/projects/" + pid)).andExpect(status().isNoContent());

        // 级联清理：会话与消息均不应残留
        assertEquals(0, sessions.findByProjectIdOrderByUpdatedAtDescIdDesc(pid).size());
        assertEquals(0, messages.findBySessionIdOrderByCreatedAtAscIdAsc(sid).size());
    }

    @Test
    void get_and_patch_and_delete_unknown_return_404() throws Exception {
        mvc.perform(get("/api/projects/nope")).andExpect(status().isNotFound());
        mvc.perform(patch("/api/projects/nope")
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"a\"}"))
            .andExpect(status().isNotFound());
        mvc.perform(delete("/api/projects/nope")).andExpect(status().isNotFound());
    }

    @Test
    void create_with_blank_name_returns_400() throws Exception {
        mvc.perform(post("/api/projects")
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
