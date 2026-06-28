package com.evocode.controlplane;

import com.evocode.controlplane.auth.JwtService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.evocode.controlplane.persistence.MessageRepository;
import com.evocode.controlplane.persistence.SessionRepository;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SessionControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired SessionRepository sessions;
    @Autowired MessageRepository messages;
    @Autowired JwtService jwt;

    private String alice;
    private String bob;

    @BeforeEach
    void setup() {
        messages.deleteAll();
        sessions.deleteAll();
        alice = "Bearer " + jwt.issue("user-alice", "alice@e.com", "USER");
        bob = "Bearer " + jwt.issue("user-bob", "bob@e.com", "USER");
    }

    private String createSession(String auth, String projectId, String title) throws Exception {
        String body = mvc.perform(post("/api/sessions").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":\"" + projectId + "\",\"title\":\"" + title + "\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).get("id").asText();
    }

    @Test
    void unauthenticated_returns_401() throws Exception {
        mvc.perform(get("/api/sessions")).andExpect(status().isUnauthorized());
    }

    @Test
    void create_then_list_filtered_by_project_and_owner() throws Exception {
        String s1 = createSession(alice, "projA", "会话1");
        createSession(alice, "projB", "会话2");

        mvc.perform(get("/api/sessions").param("projectId", "projA").header("Authorization", alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(s1));

        mvc.perform(get("/api/sessions").header("Authorization", alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void other_user_cannot_see_or_access_session() throws Exception {
        String sid = createSession(alice, "projA", "Alice 私有");
        mvc.perform(get("/api/sessions").header("Authorization", bob))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/sessions/" + sid).header("Authorization", bob))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/sessions/" + sid + "/messages").header("Authorization", bob))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/sessions/" + sid + "/messages").header("Authorization", bob)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"user\",\"kind\":\"intent\",\"text\":\"x\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void append_messages_roundtrip_and_touch_session() throws Exception {
        String sid = createSession(alice, "projA", "会话");

        mvc.perform(post("/api/sessions/" + sid + "/messages").header("Authorization", alice)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"user\",\"kind\":\"intent\",\"text\":\"加分页\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("user"));

        mvc.perform(post("/api/sessions/" + sid + "/messages").header("Authorization", alice)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"agent\",\"kind\":\"result\",\"text\":\"完成\",\"runId\":\"r1\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.runId").value("r1"));

        mvc.perform(get("/api/sessions/" + sid + "/messages").header("Authorization", alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].text").value("加分页"))
            .andExpect(jsonPath("$[1].text").value("完成"));
    }

    @Test
    void get_unknown_session_returns_404() throws Exception {
        mvc.perform(get("/api/sessions/nope").header("Authorization", alice))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/sessions/nope/messages").header("Authorization", alice))
            .andExpect(status().isNotFound());
    }

    @Test
    void create_with_blank_fields_returns_400() throws Exception {
        mvc.perform(post("/api/sessions").header("Authorization", alice)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":\"\",\"title\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
